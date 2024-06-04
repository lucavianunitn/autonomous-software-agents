import { DeliverooApi, timer } from "@unitn-asa/deliveroo-js-client";

function getClient(agentType){
    let host = process.env.HOST;
    let token

    switch (agentType) {
        case 'single':
            token =  process.env.TOKEN_SINGLE;
            break;
        case 'master':
            token =  process.env.TOKEN_MASTER;
            break;
        case 'slave':
            token =  process.env.TOKEN_SLAVE;
            break;
        case 'agent_1':
            token =  process.env.TOKEN_AGENT1;
            break;
        case 'agent_2':
            token =  process.env.TOKEN_AGENT2;
            break;    
    }

    return new DeliverooApi(host, token);
}

export async function actionMove(agentType, direction) {

    let result = await getClient(agentType).move(direction);

    if (!result)
        throw {message: "Unable to move"};

}

export async function actionRandomMove(agentType, prevMove='right') {

    const possibleMovements = { up: 'down', right: 'left', down: 'up', left: 'right' };

    if ( (prevMove in possibleMovements) === false )
        prevMove === 'right';

    let direction = prevMove;
    let tried = [];

    while (tried.length < 4) {

        direction = { up: 'down', right: 'left', down: 'up', left: 'right' }[prevMove];

        if (tried.length < 3) {
            direction = ['up', 'right', 'down', 'left'].filter(d => d != direction)[Math.floor(Math.random() * 3)];
        }

        if (!tried.includes(direction)) {

            if (await getClient(agentType).move(direction)) {
                prevMove = direction;
                break;
            }

            tried.push(direction);

        }

    }

    if (tried.length === 4)
        throw {message: "Unable to move"};

    return direction;

}

export async function actionPickUp(agentType) {

    const pickUpResult = await getClient(agentType).pickup();
    return pickUpResult;
}

export async function actionPutDown(agentType) {

    const putDownResult = await getClient(agentType).putdown();

}