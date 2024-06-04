import { PddlDomain, PddlAction, PddlProblem, PddlExecutor, onlineSolver, Beliefset } from "@unitn-asa/pddl-client";
import { actionMove, actionPickUp, actionPutDown } from "./actions.js";
import fs from 'fs';

class Plan {

    /**
     * #parent refers to caller
     */
    #parent;

    // This is used to stop the plan
    #stopped = false;

    constructor ( parent ) {
        this.#parent = parent;
    }

    get parent() { return this.#parent; }
    get stopped() { return this.#stopped; }

    stop () {
        this.#stopped = true;
    }

    considerNearAgents(beliefset, agentX, agentY, perceivedAgents){
        perceivedAgents.forEach((agentObstacle) => {
            if(Math.abs(agentObstacle.x-agentX) <= 1 || Math.abs(agentObstacle.y-agentY) <= 1){
                beliefset.declare('blocked tile_'+agentObstacle.x+'_'+agentObstacle.y); 
                // the tile my agent is near to is blocked by another one, are not considered more distant agents because we assume that in the meanwhile they are in another position
            }
        })
        return beliefset;
    }
}

export class ReachRandomDelivery extends Plan {

    static isApplicableTo ( desire ) {
        return desire === 'random';
    }

    async execute () {

        let agentX = this.parent.xPos;
        let agentY = this.parent.yPos;
        let role = this.parent.role;
        let map = this.parent.map;
        let perceivedAgents = this.parent.perceivedAgents;

        if (Number.isInteger(agentX) === false || Number.isInteger(agentY) === false)
            throw {message: "Invalid parameters"};

        let beliefset = map.returnAsBeliefset()
        // console.log(map.returnAsBeliefset().toPddlString())

        beliefset = this.considerNearAgents(beliefset, agentX, agentY, perceivedAgents);

        beliefset.declare('me me');
        beliefset.declare('at me tile_'+agentX+'_'+agentY);

        let rndDelivery = map.getRandomDelivery();

        while (rndDelivery.x === agentX && rndDelivery.y === agentY)
            rndDelivery = map.getRandomDelivery();

        var pddlProblem = new PddlProblem(
            'deliveroo',
            beliefset.objects.join(' '),
            beliefset.toPddlString(),
            `and (at me tile_${rndDelivery.x}_${rndDelivery.y})`
        )

        //build plan
        let problem = pddlProblem.toPddlString();
        // console.log(problem)
        let domain = await readFile('./src/domain-agent.pddl' );
        //console.log( domain );
        var plan = await onlineSolver( domain, problem );
        //console.log( plan );

        for (const step in plan){

            if (this.stopped)
                throw {message: `Stopped Plan ReachRandomDelivery`};

            const action = plan[step].action;

            switch (action) {
                case 'MOVE_RIGHT':
                    await actionMove(role, 'right');
                    break;
                case 'MOVE_LEFT':
                    await actionMove(role, 'left');
                    break;
                case 'MOVE_UP':
                    await actionMove(role, 'up');
                    break;
                case 'MOVE_DOWN':
                    await actionMove(role, 'down');
                    break;
            }
        }       
    }

}

export class GoPickUp extends Plan {

    static isApplicableTo ( desire ) {
        return desire == 'go_pick_up';
    }

    async execute (parcelX, parcelY, parcelId) {

        let agentX = this.parent.xPos;
        let agentY = this.parent.yPos;
        let role = this.parent.role;
        let map = this.parent.map;
        let perceivedAgents = this.parent.perceivedAgents;

        // This prevents the definition of a pddl problem with partial coordinates (like 15.4) that would brake the execution.
        if (Number.isInteger(agentX) === false || Number.isInteger(agentY) === false ||
            Number.isInteger(parcelX) === false || Number.isInteger(agentY) === false)
            throw {message: "Invalid parameters"};

        let beliefset = map.returnAsBeliefset()
        // console.log(map.returnAsBeliefset().toPddlString())
        beliefset = this.considerNearAgents(beliefset, agentX, agentY, perceivedAgents);

        beliefset.declare(`me me`);
        beliefset.declare(`at me tile_${agentX}_${agentY}`);
        beliefset.declare(`parcel ${parcelId}`);
        beliefset.declare(`at ${parcelId} tile_${parcelX}_${parcelY}`);

        var pddlProblem = new PddlProblem(
            'deliveroo',
            beliefset.objects.join(' '),
            beliefset.toPddlString(),
            `and (carry me ${parcelId})`
        )

        //build plan
        let problem = pddlProblem.toPddlString();
        // console.log(problem)
        let domain = await readFile('./src/domain-agent.pddl' );
        //console.log( domain );
        var plan = await onlineSolver( domain, problem );
        //console.log( plan );

        for (const step in plan){

            if (this.stopped)
                throw {message: `Stopped Plan GoPickUp`};

            const action = plan[step].action;

            switch (action) {
                case 'MOVE_RIGHT':
                    await actionMove(role,'right');
                    break;
                case 'MOVE_LEFT':
                    await actionMove(role, 'left');
                    break;
                case 'MOVE_UP':
                    await actionMove(role, 'up');
                    break;
                case 'MOVE_DOWN':
                    await actionMove(role, 'down');
                    break;
                case 'PICK_UP':
                    let pickedParcels = (await actionPickUp(role)).length;
                    this.parent.carriedParcels = pickedParcels + this.parent.carriedParcels;
                    break;
            }
        }       
    }

}

export class GoDelivery extends Plan {

    static isApplicableTo ( desire ) {
        return desire == 'go_delivery';
    }

    async execute () {

        let agentX = this.parent.xPos;
        let agentY = this.parent.yPos;
        let role = this.parent.role;
        let map = this.parent.map;
        let perceivedAgents = this.parent.perceivedAgents;

        if (Number.isInteger(agentX) === false || Number.isInteger(agentY) === false)
            throw {message: "Invalid parameters"};

        let beliefset = map.returnAsBeliefset()
        // console.log(map.returnAsBeliefset().toPddlString())
        beliefset = this.considerNearAgents(beliefset, agentX, agentY, perceivedAgents);

        beliefset.declare(`me me`);
        beliefset.declare(`at me tile_${agentX}_${agentY}`);
        beliefset.declare(`parcel p`);
        beliefset.declare(`carry me p`);
        beliefset.declare(`to_deliver`);

        var pddlProblem = new PddlProblem(
            'deliveroo',
            beliefset.objects.join(' '),
            beliefset.toPddlString(),
            `and (not(to_deliver))`
        )

        //build plan
        let problem = pddlProblem.toPddlString();
        // console.log(problem)
        let domain = await readFile('./src/domain-agent.pddl' );
        //console.log( domain );
        var plan = await onlineSolver( domain, problem );
        //console.log( plan );

        for (const step in plan){

            if (this.stopped)
                throw {message: `Stopped Plan GoDelivery`};

            const action = plan[step].action;

            switch (action) {
                case 'MOVE_RIGHT':
                    await actionMove(role, 'right');
                    break;
                case 'MOVE_LEFT':
                    await actionMove(role, 'left');
                    break;
                case 'MOVE_UP':
                    await actionMove(role, 'up');
                    break;
                case 'MOVE_DOWN':
                    await actionMove(role, 'down');
                    break;
                case 'PUT_DOWN_ON_DELIVERY':
                    await actionPutDown(role);
                    this.parent.carriedParcels = 0;
                    break;
            }
        }
    }
}

function readFile ( path ) {
    return new Promise( (res, rej) => {
        fs.readFile( path, 'utf8', (err, data) => {
            if (err) rej(err)
            else res(data)
        })
    })
}

export const planLibrary = [];
planLibrary.push( ReachRandomDelivery );
planLibrary.push( GoPickUp );
planLibrary.push( GoDelivery );