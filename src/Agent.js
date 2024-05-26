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
     * Plan to search for parcels while going to the center of the map.
     * Plan doesn't start if TileMap is not defined.
     * Plan stops when found a parcel or when the centered tile is reached.
     * @returns 
     */
    async planSearchInCenter() {

        console.log("START planSearchInCenter");

    }

    /**
     * It finds the coordinates of the most rewardable parcel, 
     * and it tries to do its pickup
     */
    async planPickUp() {

        console.log("START planPickUp");

    }

    /**
     * It finds the coordinates of the nearest delivery tile, 
     * and it tries to do its parcels putdown
     */
    async planDelivery() {

        console.log("START planDelivery");
    
    }

    /**
     * It pickup the dropped parcels on the current tile, and it will update the carriedReward and carriedParcels values
     */
    async pickUp() {

        const thisAgent = this;
        const client = this.#client;
        const pickUpResult = await client.pickup();

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

        const client = this.#client;

        const putDownResult = await client.putdown();

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

            this.queue( 'go_pick_up', 1, 1, this.#map ) // TODO

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

    async execute (agentX, agentY, map ) {
        const beliefset = map.returnAsBeliefset()
        // console.log(map.returnAsBeliefset().toPddlString())

        beliefset.declare('me me');
        beliefset.declare('at me tile_'+agentX+'_'+agentY);


        var pddlProblem = new PddlProblem(
            'deliveroo',
            beliefset.objects.join(' '),
            beliefset.toPddlString(),
            'and (at me tile_17_12)'
        )

        //build plan
        let problem = pddlProblem.toPddlString();
        console.log(problem)
        let domain = await readFile('./src/domain-agent.pddl' );
        //console.log( domain );
        var plan = await onlineSolver( domain, problem );

        console.log( plan );
        // const pddlExecutor = new PddlExecutor( { name: 'move_right', executor: () => console.log('right')}
        //                                     ,{ name: 'move_left', executor: () => console.log('left')}
        //                                     ,{ name: 'move_up', executor: () =>  console.log('up')}
        //                                     ,{ name: 'move_down', executor: () =>  console.log('down')}
        //                                     );

        // pddlExecutor.exec( plan )
    }

}

plans.push( new GoPickUp() )