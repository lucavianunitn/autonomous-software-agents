import { Agent } from "./Agent.js";
import { actionMove, actionPickUp, actionPutDown, actionRandomMove } from "./actions.js";

export class AgentTeam extends Agent {

    #stayIdle;

    #teammateId;
    get teammateId() { return this.#teammateId; }
    set teammateId(id) { this.#teammateId = id; }

    #teammatePosition;
    get teammatePosition() { return this.#teammatePosition; }
    set teammatePosition(pos) { this.#teammatePosition = pos; }

    #teammateDesire = "random";
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

        this.eventEmitter.on("parcel to pickup no more available", () => {
            const intention = this.getCurrentIntention();
            
            if (intention === undefined)
                return;

            if (intention.desire === "go_pick_up")
                intention.stop();
        })

        while ( true ) {

            if (this.#stayIdle) {
                await new Promise(r => setTimeout(r, 1000));
                continue;
            }

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

                    let [bestScore, bestParcelId, needTeammate] = this.selectParcel();
                    let parcel = this.perceivedParcels.get(bestParcelId);

                    if (needTeammate) {

                        let teammateAvailability = await this.askAvailability();

                        if (teammateAvailability){
                            await this.askCoordinates();
                            this.addIntention("go_delivery_team");
                        }

                    }

                    if (this.carriedParcels > 0){

                        let canDeliver;
                        [canDeliver, needTeammate] = this.evaluateDelivery(this.position.x, this.position.y);

                        if (canDeliver) {

                            if (needTeammate) {

                                let teammateAvailability = await this.askAvailability();
        
                                if (teammateAvailability){
                                    await this.askCoordinates();
                                    this.addIntention("go_delivery_team");
                                }
        
                            }
                            else
                                this.addIntention("go_delivery");

                        }
                     
                    }
                    else if (parcel !== undefined) {
                        if(this.#teammateDesire !== "random"){  //so that my teammate won't go for it because is already busy
                            await this.addInTeammateBlacklist(parcel.id);
                            this.addIntention("go_pick_up", parcel.x, parcel.y, parcel.id);
                        }else{
                            await this.askCoordinates();

                            let meParcelDistance = this.map.pathBetweenTiles(this.position, [parcel.x,parcel.y], this.perceivedAgents)[0];
                            let teammateParcelDistance = this.map.pathBetweenTiles([this.teammatePosition.x,this.teammatePosition.y], [parcel.x,parcel.y], this.perceivedAgents)[0];

                            if((this.name.slice(-1) === "1" && meParcelDistance <= teammateParcelDistance) ||
                            (this.name.slice(-1) === "2" && meParcelDistance < teammateParcelDistance) ||
                            teammateParcelDistance === -1){ // the current agent is nearer than the teammate to the identified parcel
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

                    const intention = this.getCurrentIntention();
                    const desire = intention ? intention.desire : "random";

                    this.shareDesire(desire);
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

        const agent = this;
        const map = this.map;
        const position = this.position;
        const perceivedAgents = this.perceivedAgents;
        const areParcelExpiring = this.areParcelExpiring;

        let perceivedAgentsNoTeammate = new Map(perceivedAgents);
        perceivedAgentsNoTeammate.delete(this.#teammateId) // In order to dont't see the teammate as an obstacle

        let bestScore = 0;
        let bestParcel = null;
        let needTeammate = false;

        this.perceivedParcels.forEach(function(parcel) {

            let parcelId = parcel.id;

            if (parcel.carriedBy !== null || agent.parcelsBlackList.includes(parcelId))
                return; // continue

            let parcelReward = parcel.reward;

            let [parcelAgentDistance, path, directions] = map.pathBetweenTiles(position, [parcel.x, parcel.y], perceivedAgents);

            if (parcelAgentDistance < 0)
                return; // continue

            let [canDeliver, needTeammateTemp] = agent.evaluateDelivery(parcel.x, parcel.y);

            if (canDeliver === false)
                return; // continue

            let parcelScore = 0;

            if (areParcelExpiring) {
                parcelScore = parcelReward - parcelAgentDistance - nearestDeliveryDistance;
            } else {
                parcelScore = parcelReward
            }

            if (parcelScore > bestScore) {
                bestScore = parcelScore;
                bestParcel = parcelId;
                needTeammate = needTeammateTemp;
            }

        })

        return [bestScore, bestParcel, needTeammate];

    }

    evaluateDelivery(fromX, fromY) {

        const perceivedAgents = this.perceivedAgents;

        let perceivedAgentsNoTeammate = new Map(perceivedAgents);
        perceivedAgentsNoTeammate.delete(this.#teammateId) // In order to dont't see the teammate as an obstacle

        let [nearestDeliveryDistance, coords] = this.map.getNearestDelivery([fromX, fromY], perceivedAgents);

        let canDeliver = true;
        let needTeammate = false;

        if (nearestDeliveryDistance === Infinity) { // See if it is possible to deliver parcel with the help of teammate.

            [nearestDeliveryDistance, coords] = this.map.getNearestDelivery([fromX, fromY], perceivedAgentsNoTeammate);

            if (nearestDeliveryDistance === Infinity)
                canDeliver = false;
            else
                needTeammate = true;

        }

        return [canDeliver, needTeammate];

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

    async askAvailability(){
        var reply = await this.client.ask( this.teammateId, {
            operation: "ask_teammate_availability",
        } );

        return reply;
    }

    onCommunication(){
        const agent = this;
        const client = this.client;

        client.onMsg( async (id, name, msg, reply) => {
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
                    this.addParcelInBlacklist(msg.body, 20);
                    break;
                case "ask_teammate_availability":
                    const intention = agent.getCurrentIntention();
                    if (intention === undefined || intention.desire === "random") {
                        reply(true);
                        agent.stop();
                        agent.#stayIdle = true;
                    }
                    else
                        reply(false);
                    break;
                case 'execute_action':
                    try {
                        switch (msg.body) {
                            case 'MOVE_RIGHT':
                                await actionMove(client, 'right');
                                break;
                            case 'MOVE_LEFT':
                                await actionMove(client, 'left');
                                break;
                            case 'MOVE_UP':
                                await actionMove(client, 'up');
                                break;
                            case 'MOVE_DOWN':
                                await actionMove(client, 'down');
                                break;
                            case 'PICK_UP':
                                let pickedParcels = (await actionPickUp(client)).length;
                                agent.carriedParcels = pickedParcels + agent.carriedParcels;
                                break;
                            case 'PUT_DOWN':
                            case 'PUT_DOWN_ON_DELIVERY':
                                await actionPutDown(client);
                                agent.carriedParcels = 0;
                                break;
                        }

                        reply(true) // the action requested was correctly performed
                    } catch {
                        reply(false) // the action requested failed
                    }
                    break;
                case 'release_availability':
                    this.#stayIdle = false
                    break;  
            }
    
        })

        client.onParcelsSensing( async ( perceivedParcels ) => {
            const intention = this.getCurrentIntention();
            const desire = intention ? intention.desire : "random";
            const predicate = intention ? intention.predicate : "";
            const perceivedAgents = this.perceivedAgents;

            if(desire === "go_pick_up"){
                const parcel_to_pickup_pos = {x: predicate[0] ,y: predicate[1]}

                if(this.map.createAgentsMap(perceivedAgents)[parcel_to_pickup_pos.x][parcel_to_pickup_pos.y] ||
                this.perceivedParcels.get(predicate[2]).x !== parcel_to_pickup_pos.x ||  
                this.perceivedParcels.get(predicate[2]).y !== parcel_to_pickup_pos.y){ //so, the package I want to pickup is no more available because expired, moved, taken or blocked by another agent
                    
                    this.addParcelInBlacklist(predicate[2], 20);
                    this.eventEmitter.emit("parcel to pickup no more available"); // intention revision is performed
                }
            }

            if (this.teammateDesire === "random" && this.perceivedParcels.size !== 0){
                this.shareParcels(perceivedParcels);
            }
        })
    }
}