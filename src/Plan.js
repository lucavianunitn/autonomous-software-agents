import { PddlDomain, PddlAction, PddlProblem, PddlExecutor, onlineSolver, Beliefset } from "@unitn-asa/pddl-client";
import { actionMove, actionStealAndMove, actionPickUp, actionPutDown } from "./actions.js";
import fs from 'fs';

class Plan {

    /**
     * #parent refers to caller
     */
    #parent;

    // this is an array of sub intention. Multiple ones could eventually being achieved in parallel.
    #sub_intentions = [];

    // This is used to stop the plan
    #stopped = false;

    constructor ( parent ) {
        this.#parent = parent;
    }

    get stopped () {
        return this.#stopped;
    }

    stop () {
        // this.log( 'stop plan' );
        this.#stopped = true;
        for ( const i of this.#sub_intentions ) {
            i.stop();
        }
    }

    log ( ...args ) {
        if ( this.#parent && this.#parent.log )
            this.#parent.log( '\t', ...args )
        else
            console.log( ...args )
    }

    async subIntention ( predicate ) {
        const sub_intention = new Intention( this, predicate );
        this.#sub_intentions.push( sub_intention );
        return await sub_intention.achieve();
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

/**
 * TODO: find a way to implement the stoppig action
 */
export class ReachRandomDelivery extends Plan {

    static isApplicableTo ( desire ) {
        return desire == 'random';
    }

    async execute (agentX, agentY, map, perceivedAgents) {

        if (Number.isInteger(agentX) === false || Number.isInteger(agentY) === false)
            return Promise.resolve(1);

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
        //console.log(problem)
        let domain = await readFile('./src/domain-agent.pddl' );
        //console.log( domain );
        var plan = await onlineSolver( domain, problem );
        //console.log( plan );

        for (const step in plan){
            const action = plan[step].action;

            switch (action) {
                case 'MOVE_RIGHT':
                    await actionStealAndMove('right', true).catch(err => {throw err});
                    break;
                case 'MOVE_LEFT':
                    await actionStealAndMove('left', true).catch(err => {throw err});
                    break;
                case 'MOVE_UP':
                    await actionStealAndMove('up', true).catch(err => {throw err});
                    break;
                case 'MOVE_DOWN':
                    await actionStealAndMove('down', true).catch(err => {throw err});
                    break;
            }
        }       
    }

}

export class GoPickUp extends Plan {

    static isApplicableTo ( desire ) {
        return desire == 'go_pick_up';
    }

    async execute (agentX, agentY, parcelX, parcelY, parcelId, map, perceivedAgents) {

        if (Number.isInteger(agentX) === false || Number.isInteger(agentY) === false ||
            Number.isInteger(parcelX) === false || Number.isInteger(agentY) === false)
            return Promise.resolve(1);

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
        //console.log(problem)
        let domain = await readFile('./src/domain-agent.pddl' );
        //console.log( domain );
        var plan = await onlineSolver( domain, problem );
        //console.log( plan );

        for (const step in plan){
            const action = plan[step].action;

            switch (action) {
                case 'MOVE_RIGHT':
                    await actionStealAndMove('right').catch(err => {throw err});
                    break;
                case 'MOVE_LEFT':
                    await actionStealAndMove('left').catch(err => {throw err});
                    break;
                case 'MOVE_UP':
                    await actionStealAndMove('up').catch(err => {throw err});
                    break;
                case 'MOVE_DOWN':
                    await actionStealAndMove('down').catch(err => {throw err});
                    break;
                case 'PICK_UP':
                    await actionPickUp().catch(err => {throw err});
                    break;
            }
        }       
    }

}

export class GoDelivery extends Plan {

    static isApplicableTo ( desire ) {
        return desire == 'go_delivery';
    }

    async execute (agentX, agentY, map, perceivedAgents) {

        if (Number.isInteger(agentX) === false || Number.isInteger(agentY) === false)
            return Promise.resolve(1);

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
        //console.log(problem)
        let domain = await readFile('./src/domain-agent.pddl' );
        //console.log( domain );
        var plan = await onlineSolver( domain, problem );
        //console.log( plan );

        for (const step in plan){
            const action = plan[step].action;

            switch (action) {
                case 'MOVE_RIGHT':
                    await actionStealAndMove('right').catch(err => {throw err});
                    break;
                case 'MOVE_LEFT':
                    await actionStealAndMove('left').catch(err => {throw err});
                    break;
                case 'MOVE_UP':
                    await actionStealAndMove('up').catch(err => {throw err});
                    break;
                case 'MOVE_DOWN':
                    await actionStealAndMove('down').catch(err => {throw err});
                    break;
                case 'PUT_DOWN_ON_DELIVERY':
                    await actionPutDown().catch(err => {throw err});
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