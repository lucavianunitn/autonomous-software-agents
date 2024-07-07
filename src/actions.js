export async function actionMove(client, direction) {

    let result = await client.move(direction);

    if (!result)
        throw {message: "Unable to move"};

}

export async function actionRandomMove(client, prevMove='right') {

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

            if (await client.move(direction)) {
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

export async function actionPickUp(client) {

    const pickUpResult = await client.pickup();
    return pickUpResult;
}

export async function actionPutDown(client) {

    const putDownResult = await client.putdown();

}