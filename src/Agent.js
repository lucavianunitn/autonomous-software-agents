import { DeliverooApi, timer } from "@unitn-asa/deliveroo-js-client";
import { TileMap } from "./TileMap.js";
import { EventEmitter } from "events";
import { Intention } from "./Intention.js";
import { default as config } from "./../config.js";

export const client = new DeliverooApi(config.host, config.token);

export class Agent {

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

    constructor(agentToken) {
        this.#agentToken = agentToken;
        this.setupClient();
    }

    get xPos() { return this.#xPos; }
    get yPos() { return this.#yPos; }
    get map() { return this.#map; }
    get eventEmitter() { return this.#eventEmitter; }
    get perceivedParcels() { return this.#perceivedParcels; }
    get perceivedAgents() { return this.#perceivedAgents; }
    get carriedParcels() {return this.#carriedParcels}

    set carriedParcels(carriedParcels) {this.#carriedParcels = carriedParcels}

    async intentionLoop ( ) {

        this.eventEmitter.on("found free parcels", () => {
            const intention = this.getCurrentIntention();

            if (intention === undefined)
                return;

            if (intention.desire === "random")
                intention.stop();
        })

        while ( true ) {

            // Consumes intention_queue if not empty
            if ( this.#intention_queue.length > 0 ) {

                //console.log( 'intentionRevision.loop', this.#intention_queue.map(i=>i.predicate) );
            
                const intention = this.getCurrentIntention();

                // Start achieving intention
                await intention.achieve().catch( error => {
                    console.log(error);
                } );

                // Remove from the queue
                this.#intention_queue.shift();

            }
            else {

                let isMapDefined = this.#map !== undefined;

                if (isMapDefined){
                    let bestParcelId = this.getBestParcel()[1];
                    let parcel = this.#perceivedParcels.get(bestParcelId);
    
                    let carriedParcels = this.#carriedParcels;

                    if (carriedParcels > 0){
                        this.queue("go_delivery");
                    }
                    else if (parcel !== undefined) {
                        this.queue("go_pick_up", parcel.x, parcel.y, parcel.id);
                    }
                    else {
                        this.queue("random");
                    }
                }

                // TODO: random move if map is not defined?

            }

            // Postpone next iteration at setImmediate
            await new Promise( res => setImmediate( res ) );
        }
    }

    async queue ( desire, ...predicate ) {
        // Check if already queued
        if ( this.#intention_queue.find( (i) => i.predicate.join(' ') == predicate.join(' ') ) )
            return; // intention is already queued

        //console.log('IntentionRevisionReplace.push', predicate);
        const intention = new Intention(this, desire, predicate);
        this.#intention_queue.push(intention);
    }

    async stop ( ) {
        console.log( 'stop agent queued intentions');
        for (const intention of this.#intention_queue) {
            intention.stop();
        }
    }

    getCurrentIntention() {
        return this.#intention_queue[0];
    }

    /**
     * TODO: improve this method
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

    getCarriedParcel() {
        const agentID = this.#id;
        var carriedParcels = 0;

        this.#perceivedParcels.forEach(function(parcel) {
            if (parcel.carriedBy === agentID) {
                carriedParcels++;
            }
        })

        return carriedParcels;
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

        client.onConnect( () => console.log( "socket", client.socket.id ) );
        client.onDisconnect( () => console.log( "disconnected", client.socket.id ) );

        /**
         * The event handled by this listener is emitted on agent connection.
         */
        client.onMap( ( width, height, tilesInfo ) => {

            this.#map = new TileMap(width, height, tilesInfo);

            if(this.#onMapVerbose) this.#map.printDebug();

        })

        /**
         * The event handled by this listener is emitted on agent connection and on each movement of the agent.
         * For each movement there are two event: one partial and one final.
         * NOTE: the partial movement gives a value like 10.4 on movements left and down; gives a value like 10.6 on mevements right and up.
         */
        client.onYou( ( {id, name, x, y, score} ) => {
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
        client.onParcelsSensing( async ( perceivedParcels ) => {

            this.#perceivedParcels.clear();

            let notTakenParcels = false;

            for (const parcel of perceivedParcels) {
                this.#perceivedParcels.set(parcel.id, parcel);
            }

            // Check if at least one parcel is not taken
            notTakenParcels = notTakenParcels ? true : this.getBestParcel()[1] !== null;

            if (notTakenParcels)
                this.#eventEmitter.emit("found free parcels");
            
            if(this.#onParcelsSensingVerbose) this.printPerceivedParcels();

        })

        /**
         * The event handled by this listener is emitted on agent connection, on each movement of the agent and
         * on each movement of other agents in the visible area.
         */
        client.onAgentsSensing( async ( perceivedAgents ) => {

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