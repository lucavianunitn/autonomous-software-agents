import { DeliverooApi, timer } from "../../Deliveroo.js/packages/@unitn-asa/deliveroo-js-client/index.js";
import { TileMap } from "./TileMap.js";

export class Agent {

    #serverUrl;
    #client;

    // Agent info
    #agentToken;
    #id;
    #name;
    #xPos;
    #yPos;
    #score;

    #map;

    #parcels;

    constructor(serverUrl, agentToken) {

        this.#agentToken = agentToken;
        this.#serverUrl = serverUrl;
        this.#client = new DeliverooApi(serverUrl, agentToken);

        this.#parcels = new Map();

        this.setupClient();
    }

    /**
     * starts a loop of random movements of the agents. Every movement includes the actions of putting down and picking up
     * a parcel.
     */
    async randomLoop () {

        let client = this.#client;
        let previous = 'right';
    
        while ( true ) {
    
            await client.putdown();
    
            await client.pickup();
    
            let tried = [];
    
            while ( tried.length < 4 ) {
                
                let current = { up: 'down', right: 'left', down: 'up', left: 'right' }[previous] // backward
    
                if ( tried.length < 3 ) { // try haed or turn (before going backward)
                    current = [ 'up', 'right', 'down', 'left' ].filter( d => d != current )[ Math.floor(Math.random()*3) ];
                }
                
                if ( ! tried.includes(current) ) {
                    
                    if ( await client.move( current ) ) {
                        console.log( 'moved', current );
                        previous = current;
                        break; // moved, continue
                    }
                    
                    tried.push( current );
                    
                }
                
            }
    
            if ( tried.length == 4 ) {
                console.log( 'stucked' );
                await client.timer(1000); // stucked, wait 1 sec and retry
            }
    
    
        }
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

        this.#client.onParcelsSensing( async ( perceived_parcels ) => {
            for (const p of perceived_parcels) {
                this.#parcels.set( p.id, p)
            }
        })

        /**
         * The event handled by this listener is emitted on agent connection and on each movement of the agent.
         * For each movement there are two event: one partial and one final.
         * NOTE: the partial movement gives a value like 10.4 on movements left and down; gives a value like 10.6 on mevements right and up.
         */
        this.#client.onYou( ( {id, name, x, y, score} ) => {
            this.#id = id
            this.#name = name
            this.#xPos = x
            this.#yPos = y
            this.#score = score

            console.log(`AGENT ${this.#id} DEBUG:`)
            console.log("- id: " + id);
            console.log("- name: " + name);
            console.log("- xPos: " + x);
            console.log("- yPos:" + y);
            console.log("- score: " + score);
            console.log("\n");
        } )

        /**
         * The event handled by this listener is emitted on agent connection.
         */
        this.#client.onMap( ( width, height, tilesInfo ) => {

            this.#map = new TileMap(width, height, tilesInfo);

            this.#map.printDebug();

        })

    }

}