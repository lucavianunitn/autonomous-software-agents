import { DeliverooApi, timer } from "@unitn-asa/deliveroo-js-client";
import { PddlDomain, PddlAction, PddlProblem, PddlExecutor, onlineSolver, Beliefset } from "@unitn-asa/pddl-client";
import { TileMap } from "./TileMap.js";
import { EventEmitter } from "events";
import fs from 'fs';

function readFile ( path ) {
    return new Promise( (res, rej) => {
        fs.readFile( path, 'utf8', (err, data) => {
            if (err) rej(err)
            else res(data)
        })
    })
}

export class Agent {

    #serverUrl;
    #client;

    // Agent info
    #agentToken
    #id;
    #name;
    #xPos;
    #yPos;
    #score;

    #map;

    #intention_queue = new Array();

    #eventEmitter = new EventEmitter();
    #perceivedParcels = new Map();
    #perceivedAgents = new Map();
    #carriedReward = 0;
    #carriedParcels = 0;

    // Debug Flags
    #onYouVerbose = process.env.ON_YOU_VERBOSE === "true"
    #onMapVerbose = process.env.ON_MAP_VERBOSE === "true"
    #onParcelsSensingVerbose = process.env.ON_PARCELS_SENSING_VERBOSE === "true"
    #onAgentsSensingVerbose = process.env.ON_AGENT_SENSING_VERBOSE === "true"
    #pathBetweenTilesVerbose = process.env.PATH_BETWEEN_TILES_VERBOSE === "true"
    #strategyChosenVerbose = process.env.STRATEGY_CHOSEN_VERBOSE === "true"
    #errorMessagesVerbose = process.env.ERROR_MESSAGES_VERBOSE === "true"

    // Other flags
    #moveToCenteredDeliveryCell = true; // if true, during the planSearchInCenter strategy it will point to the most centered delivery tile
    #areParcelExpiring = true; // if true, the parcels that for sure cannot be delivered before their expiration won't be considered for pickup

    constructor(serverUrl, agentToken) {

        this.#client = new DeliverooApi(serverUrl, agentToken);

        this.#agentToken = agentToken;
        this.#serverUrl = serverUrl;

        this.setupClient();

        this.#eventEmitter.on("restart", this.start.bind(this));
    }

    async intentionLoop ( ) {
        while ( true ) {
            const intention = this.#intention_queue.shift();
            if ( intention )
                await intention.achieve();
            await new Promise( res => setImmediate( res ) );
        }
    }

    async queue ( desire, ...args ) {
        const last = this.#intention_queue.at( this.#intention_queue.length - 1 );
        const current = new Intention( desire, ...args )
        this.#intention_queue.push( current );
    }

    async stop ( ) {
        console.log( 'stop agent queued intentions');
        for (const intention of this.#intention_queue) {
            intention.stop();
        }
    }
    /**
     * It chooses the strategy to follow based on the enviroment status the agent can perceive
     */
    async start() {
        try {
            let [bestParcelProfit, bestParcelId, bestDeliveryTile] = this.getBestParcel();

            let isMapDefined = this.#map !== undefined
            let isAnyParcelPerceived = this.#perceivedParcels.size !== 0
            let isThereProfitableParcel = bestParcelProfit !== 0
            let areCarriedParcelsDeliveryThreshold = this.#carriedParcels !== 0 && this.#carriedParcels >= 3

            // if map is defined and:
            // I have less than 4 parcels but at least one OR
            // I have at least a parcel and I dindn't see anything other valuable
            if (isMapDefined && (areCarriedParcelsDeliveryThreshold || (this.#carriedParcels !== 0 && (!isAnyParcelPerceived || !isThereProfitableParcel)))) {
                console.log("isAnyParcelPerceived "+isAnyParcelPerceived)
                if(this.#strategyChosenVerbose){
                    console.log("Parcel DELIVERY strategy chosen");
                }

                await this.planDelivery();
            } else if (!isMapDefined || !isAnyParcelPerceived || !isThereProfitableParcel) {
                if(this.#strategyChosenVerbose){
                    console.log("CENTER/RANDOM strategy chosen");
                }

                await this.planSearchInCenter();
                await this.planRandomLoop();
            }
            else {
                if(this.#strategyChosenVerbose){
                    console.log("Parcel PICKUP strategy chosen, n_parcel="+this.#perceivedParcels.size+"/ max_score= "+bestParcelProfit);
                }

                await this.planPickUp();
            }

        }
        catch(error) {
            if (this.#errorMessagesVerbose) console.log(error)
            await this.#client.timer(1000);
            await this.planRandomLoop();
        }

        this.#eventEmitter.emit("restart");
    }

    /**
     * Plan to search for parcels while going to the center of the map.
     * Plan doesn't start if TileMap is not defined.
     * Plan stops when found a parcel or when the centered tile is reached.
     * @returns 
     */
    async planSearchInCenter() {

        console.log("START planSearchInCenter");

        const client = this.#client;
        const map = this.#map;

        if (map === undefined) {
            console.log("END planSearchInCenter (no map)");
            return Promise.resolve(1);
        }
        
        const centeredTile = map.getCenteredTile(this.#moveToCenteredDeliveryCell);
        const destination = [centeredTile.x,centeredTile.y];

        while(true){

            // Found a parcel
            if (this.#perceivedParcels.size > 0 && this.getBestParcel()[0] > 0) {
                console.log("END planSearchInCenter (found parcel)");
                return Promise.resolve(1);
            }

            let [distance, path, directions] = map.pathBetweenTiles([this.#xPos,this.#yPos],destination,this.#perceivedAgents);
    
            // Reached center
            if (distance === 0) {
                if(this.#xPos % 1 != 0 && this.#yPos % 1 != 0){ // The agent is still moving
                    await client.timer(500); // Waiting allow the agent to pickup the parcel
                }
                console.log("END planSearchInCenter (reached center)");
                return Promise.resolve(1);
            }
            else if(distance < 0){
                console.log("ERROR, it's not possible to reach "+destination);
                return Promise.resolve(0);
            }else{
                await this.putDown();
                await this.pickUp();
                await client.move(directions[0]);          
            }    
        }

    }

    /**
     * starts a loop of random movements of the agents. Every movement includes the actions of putting down and picking up
     * a parcel.
     */
    async planRandomLoop() {

        console.log("START planRandomLoop");

        const client = this.#client;

        let previous = 'right';
    
        while (true) {
            console.log("loop");

            // TileMap is defined and found a parcel
            if (this.#map !== undefined && this.#perceivedParcels.size > 0 && this.getBestParcel()[0] > 0) {
                console.log("END planRandomLoop (TileMap defined and parcel found)");
                return Promise.resolve(1);
            }
            console.log("before await");
            await this.putDown();
            console.log("after await");

            await this.pickUp();
    
            let tried = [];
    
            while (tried.length < 4) {
                
                let current = {up: 'down', right: 'left', down: 'up', left: 'right'}[previous] // backward
    
                if (tried.length < 3) // try haed or turn (before going backward)
                    current = ['up', 'right', 'down', 'left'].filter(d => d != current)[Math.floor(Math.random()*3)];
                
                if (! tried.includes(current)) {
                    console.log("before await");

                    if (await client.move(current)) {
                        console.log("inside await");

                        //console.log( 'moved %s', current );
                        previous = current;
                        break; // moved, continue
                    }
                    
                    tried.push(current);
                    
                }
                
            }
    
            if (tried.length == 4) {
                console.log('planRandomLoop: Stucked');
                await client.timer(1000); // stucked, wait 1 sec and retry
            }
        }
    }

    /**
     * It finds the coordinates of the most rewardable parcel, 
     * and it tries to do its pickup
     */
    async planPickUp() {

        console.log("START planPickUp");

        const client = this.#client;
        const [bestScore, bestParcelId, bestDelivery] = this.getBestParcel();

        if (bestScore === 0){ // No parcel found
            await client.timer(500);
            console.log("END planPickUp (no best parcel)");
            return Promise.resolve(1);
        }

        const bestParcel = this.#perceivedParcels.get(bestParcelId);

        if (await this.goTo([bestParcel.x,bestParcel.y], bestParcelId, false) === 0) return Promise.resolve(0);
        await this.pickUp();

        console.log("END planPickUp (parcel's cell reached)");
        return Promise.resolve(1);
    }

    /**
     * It finds the coordinates of the nearest delivery tile, 
     * and it tries to do its parcels putdown
     */
    async planDelivery() {

        console.log("START planDelivery");
        let agentX = this.#xPos;
        let agentY = this.#yPos;
        let map = this.#map;
        let perceivedAgents = this.#perceivedAgents;

        let [distance, bestDelivery] = map.getNearestDelivery([agentX, agentY], perceivedAgents);

        if (await this.goTo([bestDelivery.x, bestDelivery.y], null, true) === 0) return Promise.resolve(0); // forse sarebbe da insistere un po' di più
        await this.putDown();

        console.log("END planDelivery");
        return Promise.resolve(1);
    }


    /**
     * It will move the agent to the tile [x,y] by also considering the map structure and the presence of other agents
     */
    async goTo([x, y], parcelToPickup = null, imDelivering = false) {

        const client = this.#client;
        const destination = [x,y];

        while(true){

            let [distance, path, directions] = this.#map.pathBetweenTiles([this.#xPos,this.#yPos],destination,this.#perceivedAgents);

            if(this.#pathBetweenTilesVerbose){
                console.log("Distance "+distance);
                console.log("Destination "+destination)
                //console.log("path "+path);
                //console.log("directions "+directions);   
                //console.log("next direction "+directions[0]); 
            }
    
            if (parcelToPickup !== null){ // so, I'm coming from a pickup strategy
                const bestParcel = this.#perceivedParcels.get(parcelToPickup);

                if (!bestParcel || bestParcel.carriedBy !== null){
                    console.log("ERROR, the parcel in "+destination+" is expired or already taken by another agent ");
                    return Promise.resolve(0);    
                }
            }

            if (imDelivering && this.#carriedParcels === 0){ // so, I'm coming from a delivery strategy and the packages I'm carrying are expired, I can stop the strategy
                console.log("ERROR, the parcels to bring in delivery "+destination+" are expired");
                return Promise.resolve(0);    
            } 

            if (distance === 0) {
                if(this.#xPos % 1 != 0 && this.#yPos % 1 != 0){ // The agent is still moving
                    await client.timer(500); // Waiting allow the agent to pickup the parcel
                }
                return Promise.resolve(1);
            }
            else if(distance < 0){
                console.log("ERROR, it's not possible to reach "+destination);
                return Promise.resolve(0);
            }else{
                await this.putDown();
                await this.pickUp();
                await client.move(directions[0]);          
            }    
        }

    }

    /**
     * It pickup the dropped parcels on the current tile, and it will update the carriedReward and carriedParcels values
     */
    async pickUp() {
        console.log("CIAO0");
        const thisAgent = this;
        console.log("CIAO1");
        const client = this.#client;
        console.log("CIAO2");
        const pickUpResult = await client.pickup();
        console.log("POLLO");

        pickUpResult.forEach(function(result){
            thisAgent.#carriedReward += result.reward;
            thisAgent.#carriedParcels += 1;
        })

        return pickUpResult;
    }

    /**
     * It putdown the parcels on the current tile, and it will reset the carriedReward and carriedParcels values
     */
    async putDown() {
        console.log("CIAO0");
        const client = this.#client;
        console.log("CIAO1");

        const putDownResult = await client.putdown();
        console.log("CIAO2");

        this.#carriedReward = 0;
        this.#carriedParcels = 0;

        return putDownResult;
    }

    /**
     * It will found the best parcel to try to pickup based on its estimated profit once delivered considering:
     * - the parcel value (higher is better)
     * - the parcel distance to the agent (lower is better)
     * - the parcel distance to the nearest delivery tile (lower is better)
     */
    getBestParcel() {

        let agentX = this.#xPos;
        let agentY = this.#yPos;
        let map = this.#map;
        let perceivedAgents = this.#perceivedAgents;
        let areParcelExpiring = this.#areParcelExpiring
        let bestScore = 0;
        let bestParcel = null;
        let bestDelivery = null;

        this.#perceivedParcels.forEach(function(parcel) {

            let parcelId = parcel.id;

            let parcelReward = parcel.reward;
            let [parcelAgentDistance, path, directions] = map.pathBetweenTiles([agentX,agentY], [parcel.x,parcel.y], perceivedAgents);
            let [parcelNearestDeliveryDistance, coords] = map.getNearestDelivery([parcel.x, parcel.y], perceivedAgents);

            let parcelScore = 0;
            if (areParcelExpiring){
                parcelScore = parcelReward - parcelAgentDistance - parcelNearestDeliveryDistance;
            }else{
                parcelScore = parcelReward
            }
            
            if (parcelScore > bestScore && parcelAgentDistance > 0 && parcelNearestDeliveryDistance >= 0 && parcel.carriedBy === null) {
                bestScore = parcelScore;
                bestParcel = parcelId;
                bestDelivery = coords;
            }

        })

        return [bestScore, bestParcel, bestDelivery];

    }

    /**
     * @returns the token of this agent.
     */
    getAgentToken() {

        return this.#agentToken;
    }
    
    /**
     * Setup of the client.
     */
    setupClient() {

        this.#client.onConnect( () => console.log( "socket",  this.#client.socket.id ) );

        this.#client.onDisconnect( () => console.log( "disconnected",  this.#client.socket.id ) );

        /**
         * The event handled by this listener is emitted on agent connection.
         */
        this.#client.onMap( ( width, height, tilesInfo ) => {

            this.#map = new TileMap(width, height, tilesInfo);

            if(this.#onMapVerbose) this.#map.printDebug();

        })

        /**
         * The event handled by this listener is emitted on agent connection and on each movement of the agent.
         * For each movement there are two event: one partial and one final.
         * NOTE: the partial movement gives a value like 10.4 on movements left and down; gives a value like 10.6 on mevements right and up.
         */
        this.#client.onYou( ( {id, name, x, y, score} ) => {
            this.#id = id;
            this.#name = name;
            this.#xPos = x;
            this.#yPos = y;
            this.#score = score;

            if(this.#onYouVerbose) this.printDebug();
        } )

        /**
         * The event handled by this listener is emitted on agent connection and on each movement of the agent.
         * NOTE: this event is emitted also when a parcel carried by another agents enters in the visible area? 
         */
        this.#client.onParcelsSensing( async ( perceivedParcels ) => {

            this.#perceivedParcels.clear();

            for (const parcel of perceivedParcels)
                this.#perceivedParcels.set(parcel.id, parcel);
            
            if(this.#onParcelsSensingVerbose) this.printPerceivedParcels();

        })

        /**
         * The event handled by this listener is emitted on agent connection, on each movement of the agent and
         * on each movement of other agents in the visible area.
         */
        this.#client.onAgentsSensing( async ( perceivedAgents ) => {

            this.#perceivedAgents.clear();

            for (const agent of perceivedAgents)
                this.#perceivedAgents.set(agent.id, agent);
            
                if(this.#onAgentsSensingVerbose) this.printPerceivedAgents();

        })
    }

    printDebug() {

        console.log("Agent {");
        console.log(`- agentToken = ${this.#agentToken}`);
        console.log(`- id = ${this.#id}`);
        console.log(`- name = ${this.#name}`);
        console.log(`- xPos = ${this.#xPos}`);
        console.log(`- yPos = ${this.#yPos}`);
        console.log(`- score = ${this.#score}`);
        console.log("}");
        console.log();
    }

    printPerceivedParcels() {

        console.log(`Agent '${this.#name}' perceived parcels map:`);
        console.log(this.#perceivedParcels);
        console.log();
    }

    printPerceivedAgents() {

        console.log(`Agent '${this.#name}' perceived agents map:`);
        console.log(this.#perceivedAgents);
        console.log();
    }

}

/**
 * Intention
 */
export class Intention extends Promise {

    #current_plan;
    stop () {
        console.log( 'stop intention and current plan');
        this.#current_plan.stop();
    }

    #desire;
    #args;

    #resolve;
    #reject;

    constructor ( desire, ...args ) {
        var resolve, reject;
        super( async (res, rej) => {
            resolve = res; reject = rej;
        } )
        this.#resolve = resolve
        this.#reject = reject
        this.#desire = desire;
        this.#args = args;
    }

    #started = false;
    async achieve () {
        if ( this.#started)
            return this;
        else
            this.#started = true;

        for (const plan of plans) {
            console.log("DESIRE: "+this.#desire);
            
            if ( plan.isApplicableTo( this.#desire ) ) {
                this.#current_plan = plan;
                console.log('achieving desire', this.#desire, ...this.#args, 'with plan', plan);
                try {
                    const plan_res = await plan.execute( ...this.#args );
                    this.#resolve( plan_res );
                    console.log( 'plan', plan, 'succesfully achieved intention', this.#desire, ...this.#args, 'with result', plan_res );
                    return plan_res
                } catch (error) {
                    console.log( 'plan', plan, 'failed while trying to achieve intention', this.#desire, ...this.#args, 'with error', error );
                }
            }
        }

        this.#reject();
        console.log('no plan satisfied the desire ', this.#desire, ...this.#args);
        throw 'no plan satisfied the desire ' + this.#desire;
    }

}

/**
 * Plan library
 */
const plans = [];

export class Plan {

    stop () {
        console.log( 'stop plan and all sub intentions');
        for ( const i of this.#sub_intentions ) {
            i.stop();
        }
    }

    #sub_intentions = [];

    async subIntention ( desire, ...args ) {
        const sub_intention = new Intention( desire, ...args );
        this.#sub_intentions.push(sub_intention);
        return await sub_intention.achieve();
    }

}

export class GoPickUp extends Plan {

    isApplicableTo ( desire ) {
        return desire == 'go_pick_up';
    }

    async execute ( {x, y} ) {
        await this.subIntention( 'go_to', {x, y} );
        await client.pickup()
    }

}

export class BlindMove extends Plan {

    isApplicableTo ( desire ) {
        return desire == 'go_to';
    }

    async execute ( {x, y} ) { 
        while ( me.x != x || me.y != y ) {

            let status_x = undefined;
            let status_y = undefined;
            
            console.log('me', me, 'xy', x, y);

            if ( x > me.x )
                status_x = await client.move('right')
                // status_x = await this.subIntention( 'go_to', {x: me.x+1, y: me.y} );
            else if ( x < me.x )
                status_x = await client.move('left')
                // status_x = await this.subIntention( 'go_to', {x: me.x-1, y: me.y} );

            if (status_x) {
                me.x = status_x.x;
                me.y = status_x.y;
            }

            if ( y > me.y )
                status_y = await client.move('up')
                // status_x = await this.subIntention( 'go_to', {x: me.x, y: me.y+1} );
            else if ( y < me.y )
                status_y = await client.move('down')
                // status_x = await this.subIntention( 'go_to', {x: me.x, y: me.y-1} );

            if (status_y) {
                me.x = status_y.x;
                me.y = status_y.y;
            }
            
            if ( ! status_x && ! status_y) {
                console.log('stucked')
                break;
            } else if ( me.x == x && me.y == y ) {
                console.log('target reached')
            }
            
        }

    }
}

export class LampAction extends Plan {

    isApplicableTo ( desire ) {
        return desire == 'lamp_action';
    }

    async execute ( {x, y} ) {
        console.log("BELLA ZIO")
        let problem = await readFile('./src/problem-lights.pddl' );
        console.log( problem );
        let domain = await readFile('./src/domain-lights.pddl' );

        var plan = await onlineSolver(domain, problem);
        console.log( plan );
        
        const pddlExecutor = new PddlExecutor( { name: 'lightOn', executor: (l)=>console.log('exec lighton '+l) } );
        pddlExecutor.exec( plan );
    }

}

plans.push( new GoPickUp() )
plans.push( new BlindMove() )
plans.push( new LampAction() )
