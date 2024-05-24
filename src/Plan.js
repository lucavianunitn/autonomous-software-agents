import { DeliverooApi } from "../../Deliveroo.js/packages/@unitn-asa/deliveroo-js-client/index.js";
import { PddlDomain, PddlAction, PddlProblem, PddlExecutor, onlineSolver, Beliefset } from "@unitn-asa/pddl-client";
import { TileMap } from "./TileMap.js";
import fs from 'fs';


function readFile ( path ) {
    
    return new Promise( (res, rej) => {

        fs.readFile( path, 'utf8', (err, data) => {
            if (err) rej(err)
            else res(data)
        })

    })

}

/**
 * Intention execution loop
 */
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
        console.log("Called constructor with "+serverUrl+", "+agentToken);
        this.#agentToken = agentToken;
        this.#serverUrl = serverUrl;

        this.setupClient();
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

    intention_queue = new Array();

    async intentionLoop ( ) {
        // while ( true ) {
        //     const intention = this.intention_queue.shift();
        //     if ( intention ){
        //         console.log("AGENT HAS INTENTION "+intention)
        //         await intention.achieve();
        //     }
        //     await new Promise( res => setImmediate( res ) );
        // }
    }

    async queue ( desire, ...args ) {
        const last = this.intention_queue.at( this.intention_queue.length - 1 );
        const current = new Intention( desire, ...args )
        this.intention_queue.push( current );
        console.log("INTENTION PUSHED")
    }

    async stop ( ) {
        console.log( 'stop agent queued intentions');
        for (const intention of this.intention_queue) {
            intention.stop();
        }
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
        let problem = await readFile('./problem-lights.pddl' );
        console.log( problem );
        let domain = await readFile('./domain-lights.pddl' );

        var plan = await onlineSolver(domain, problem);
        console.log( plan );
        
        const pddlExecutor = new PddlExecutor( { name: 'lightOn', executor: (l)=>console.log('exec lighton '+l) } );
        pddlExecutor.exec( plan );
    }

}

plans.push( new GoPickUp() )
plans.push( new BlindMove() )
plans.push( new LampAction() )



const myAgent = new Agent(process.env.HOST, process.env.TOKEN_CHALLENGE_1)
//myAgent.intentionLoop()

// myAgent.queue( 'go_to', {x:1, y:1} ) 
// myAgent.queue( 'lamp_action', {x:1, y:1} ) 
