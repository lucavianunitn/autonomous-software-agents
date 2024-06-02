import { client } from "./Agent.js";

export async function actionMove(direction) {

    let result = await client.move(direction);

    if (!result)
        throw {message: "Unable to move"};

}

export async function actionPickUp() {

    const pickUpResult = await client.pickup();
    return pickUpResult;
}

export async function actionPutDown() {

    const putDownResult = await client.putdown();

}