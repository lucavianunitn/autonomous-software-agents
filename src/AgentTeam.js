import { Agent } from "./Agent.js";

export class AgentTeam extends Agent {

    #stayIdle;

    #teammateId;
    get teammateId() { return this.#teammateId; }
    set teammateId(id) { this.#teammateId = id; }

    #teammatePosition;
    get teammatePosition() { return this.#teammatePosition; }
    set teammatePosition(pos) { this.#teammatePosition = pos; }


    #teammateDesire;
    get teammateDesire() { return this.#teammateDesire; }
    set teammateDesire(desire) { this.#teammateDesire = desire; }

    // Debug Flags
    #onReceivedMsgVerbose = process.env.ON_RECEIVED_MSG_VERBOSE === "true"
    
    // Other flags
    #areParcelExpiring = true; // if true, the parcels that for sure cannot be delivered before their expiration won't be considered for pickup

    constructor(host, token) {

        super(host, token);

        this.onCommunication();
        this.#stayIdle = false;

    }

    // TODO: insert modifications for teamwork communication
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
            if ( this.intentionQueue.length > 0 ) {
            
                const intention = this.getCurrentIntention();

                // Start achieving intention
                await intention.achieve().catch( error => { console.log(error); } );

                // Remove from the queue
                this.intentionQueue.shift();

            }
            else {

                let isMapDefined = this.map !== undefined;

                if (isMapDefined) {

                    let bestParcelId = this.selectParcel()[1];
                    let parcel = this.perceivedParcels.get(bestParcelId);

                    if (this.carriedParcels > 0){

                        await this.askCoordinates();
                        this.addIntention("go_delivery_team");
                     
                    }
                    else if (parcel !== undefined) {
                        if(this.#teammateDesire !== "random"){  //so that my teammate won't go for it because is already busy
                            await this.addInTeammateBlacklist(parcel.id);
                            this.addIntention("go_pick_up", parcel.x, parcel.y, parcel.id);
                        }else{
                            await this.askCoordinates();

                            if(this.map.pathBetweenTiles(this.position, [parcel.x,parcel.y], this.perceivedAgents)[0] < 
                            this.map.pathBetweenTiles([this.teammatePosition.x,this.teammatePosition.y], [parcel.x,parcel.y], this.perceivedAgents)[0]){
                                this.addInTeammateBlacklist(parcel.id);
                                this.addIntention("go_pick_up", parcel.x, parcel.y, parcel.id);
                            }else{
                                this.addIntention("random", parcel.x, parcel.y, parcel.id);
                            }
                        }
                    }
                    else {
                        // presenza pacchetti chiesta in onParcelSensing e limitata a questo caso
                        this.addIntention("random");
                    }

                    this.shareDesire(this.getCurrentIntention().desire);
                }

                // TODO: random move if map is not defined?

            }

            // Postpone next iteration at setImmediate
            await new Promise( res => setImmediate( res ) );
        }
    }

    /**
     * TODO: improve this method
     * TODO: insert modifications for teamwork communication
     * It will found the best parcel to try to pickup based on its estimated profit once delivered considering:
     * - the parcel value (higher is better)
     * - the parcel distance to the agent (lower is better)
     * - the parcel distance to the nearest delivery tile (lower is better)
     */
    selectParcel() {

        let bestScore = 0;
        let bestParcel = null;
        let bestDelivery = null;

        const agent = this;

        const map = this.map;
        const position = this.position;
        const perceivedAgents = this.perceivedAgents;
        let perceivedAgentsNoTeammate = new Map(perceivedAgents);
        perceivedAgentsNoTeammate.delete(this.#teammateId) // In order to dont't see the teammate as an obstacle

        const areParcelExpiring = this.areParcelExpiring;

        this.perceivedParcels.forEach(function(parcel) {

            let parcelId = parcel.id;

            if(agent.parcelsBlackList.includes(parcelId) === false){
                let parcelReward = parcel.reward;
                let [parcelAgentDistance, path, directions] = map.pathBetweenTiles(position, [parcel.x,parcel.y], perceivedAgents);
                let [parcelNearestDeliveryDistance, coords] = map.getNearestDelivery([parcel.x, parcel.y], perceivedAgentsNoTeammate);

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

            }

        })

        return [bestScore, bestParcel, bestDelivery];

    }

    async askCoordinates(){
        var reply = await this.client.ask( this.teammateId, {
            operation: "ask_teammate_coordinates",
        } );

        this.teammatePosition = reply;
        // console.log("teammate position")
        // console.log(this.teammatePosition)
    }

    async shareDesire(desire){
        await this.client.say( this.teammateId, {
            operation: "share_desire",
            body: desire
        } );
    }

    async shareParcels(perceivedParcels){
        await this.client.say( this.teammateId, {
            operation: "share_parcels",
            body: perceivedParcels
        } );
    }

    async addInTeammateBlacklist(parcelId){
        await this.client.say( this.teammateId, {
            operation: "add_in_tm_blacklist",
            body: parcelId
        } );
    }

    onCommunication(){
        const agent = this;

        this.client.onMsg( async (id, name, msg, reply) => {
            if (id !== agent.#teammateId) return;

            switch(msg.operation){
                case "ask_teammate_coordinates":
                    reply({x: Math.round(this.position.x), y: Math.round(this.position.y)});
                    break;
                case "share_desire":
                    this.teammateDesire = msg.body;
                    console.log("share_desire "+this.teammateDesire);
                    break;
                case "share_parcels":
                    let notTakenParcels = false;

                    for (const parcel of msg.body) {
                        this.perceivedParcels.set(parcel.id, parcel);
                    }
        
                    // Check if at least one parcel is not taken
                    notTakenParcels = notTakenParcels ? true : this.selectParcel()[1] !== null;
        
                    if (notTakenParcels)
                        this.eventEmitter.emit("found free parcels"); // intention revision is performed
        
                    // console.log("share_parcels");
                    // console.log(msg.body);
                    break;   
                case "add_in_tm_blacklist":
                    this.parcelsBlackList.push(msg.body);
                    break; 
            }
    
        })

        this.client.onParcelsSensing( async ( perceivedParcels ) => {
            if (this.teammateDesire === "random" && this.perceivedParcels.size !== 0){
                this.shareParcels(perceivedParcels);
            }
        })
    }
}