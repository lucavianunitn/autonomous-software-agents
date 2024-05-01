import { DeliverooApi, timer } from "../../Deliveroo.js/packages/@unitn-asa/deliveroo-js-client/index.js";
import { TileMap } from "./TileMap.js";
import { EventEmitter } from "events";

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

    #eventEmitter = new EventEmitter();
    #perceivedParcels = new Map();
    #perceivedAgents = new Map();

    // Debug Flags
    #onYouVerbose = process.env.ON_YOU_VERBOSE === "true"
    #onMapVerbose = process.env.ON_MAP_VERBOSE === "true"
    #onParcelsSensingVerbose = process.env.ON_PARCELS_SENSING_VERBOSE === "true"
    #onAgentsSensingVerbose = process.env.ON_AGENT_SENSING_VERBOSE === "true"
    #pathBetweenTilesVerbose = process.env.PATH_BETWEEN_TILES_VERBOSE === "true"

    constructor(serverUrl, agentToken) {

        this.#client = new DeliverooApi(serverUrl, agentToken);

        this.#agentToken = agentToken;
        this.#serverUrl = serverUrl;

        this.setupClient();

        this.#eventEmitter.on("restart", this.start.bind(this));
    }

    async start() {

        if (this.#map === undefined || this.#perceivedParcels.size === 0 || this.getBestParcel()[0] === 0) {
            console.log("Random Loop chosen, n_parcel="+this.#perceivedParcels.size+"/ max_score= "+this.getBestParcel()[0]);
            await this.planSearchInCenter();
            await this.planRandomLoop();
        }
        else {
            console.log("Package delivery strategy chosen, n_parcel="+this.#perceivedParcels.size+"/ max_score= "+this.getBestParcel()[0]);
            await this.planPickUpAndDeliver();
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

        const centeredTile = map.getCenteredTile();
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
                    await client.timer(500); // Waiting allow the agent to pickup the package
                }
                console.log("END planSearchInCenter (reached center)");
                return Promise.resolve(1);
            }
            else if(distance < 0){
                console.log("ERROR, it's not possible to reach "+destination);
                return Promise.resolve(0);
            }else{
                await client.putdown();
                await client.pickup();
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

            // TileMap is defined and found a parcel
            if (this.#map !== undefined && this.#perceivedParcels.size > 0 && this.getBestParcel()[0] > 0) {
                console.log("END planRandomLoop (TileMap defined and parcel found)");
                return Promise.resolve(1);
            }
    
            await client.putdown();
            await client.pickup();
    
            let tried = [];
    
            while (tried.length < 4) {
                
                let current = {up: 'down', right: 'left', down: 'up', left: 'right'}[previous] // backward
    
                if (tried.length < 3) // try haed or turn (before going backward)
                    current = ['up', 'right', 'down', 'left'].filter(d => d != current)[Math.floor(Math.random()*3)];
                
                if (! tried.includes(current)) {
                    
                    if (await client.move(current)) {
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
     * It finds the coordinates of the most rewardable parcel and of the nearest delivery tile to it, 
     * and it tries to do the pickup and delivery of that parcel
     */
    async planPickUpAndDeliver() {

        console.log("START planPickUpAndDeliver");

        const client = this.#client;
        const [bestScore, bestParcelId, bestDelivery] = this.getBestParcel();

        if (bestScore === 0){ // No package found
            await client.timer(500);
            console.log("END planPickUpAndDeliver (no best parcel)");
            return Promise.resolve(1);
        }

        const bestParcel = this.#perceivedParcels.get(bestParcelId);

        console.log("planPickUpAndDeliver: GOTO PARCEL ")
        if (await this.goTo(bestParcel.x,bestParcel.y) === 0) return Promise.resolve(0);
        await client.pickup();

        console.log("planPickUpAndDeliver: GOTO DELIVERY")
        if (await this.goTo(bestDelivery.x, bestDelivery.y) === 0) return Promise.resolve(0);
        await client.putdown();

        return Promise.resolve(1);
    }

    async goTo(x,y) {

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
    
            if (distance === 0) {
                if(this.#xPos % 1 != 0 && this.#yPos % 1 != 0){ // The agent is still moving
                    await client.timer(500); // Waiting allow the agent to pickup the package
                }
                return Promise.resolve(1);
            }
            else if(distance < 0){
                console.log("ERROR, it's not possible to reach "+destination);
                return Promise.resolve(0);
            }else{
                await client.putdown();
                await client.pickup();
                await client.move( directions[0] );          
            }    
        }

    }

    getBestParcel() {

        let agentX = this.#xPos;
        let agentY = this.#yPos;
        let map = this.#map;
        let perceivedAgents = this.#perceivedAgents;

        let bestScore = 0;
        let bestParcel = null;
        let bestDelivery = null;

        this.#perceivedParcels.forEach(function(parcel) {

            let parcelId = parcel.id;

            let parcelReward = parcel.reward;
            let [parcelAgentDistance, path, directions] = map.pathBetweenTiles([agentX,agentY], [parcel.x,parcel.y], perceivedAgents);
            let [coords, parcelNearestDeliveryDistance] = map.getNearestDelivery(parcel.x, parcel.y, perceivedAgents);

            let parcelScore = parcelReward - parcelAgentDistance - parcelNearestDeliveryDistance;

            if (parcelScore > bestScore && parcelAgentDistance >= 0 && parcelNearestDeliveryDistance >= 0 && parcel.carriedBy === null) {
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
         * NOTE: this event is emitted also when a package carried by another agents enters in the visible area? 
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