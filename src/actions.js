import { client } from "./Agent.js";

export async function actionMove(direction) {

    await client.move(direction);

}

export async function actionStealAndMove(direction) {

    await client.move(direction);
    await actionPutDown();
    await actionPickUp();

}

export async function actionPickUp() {

    const pickUpResult = await client.pickup();

}

export async function actionPutDown() {

    const putDownResult = await client.putdown();

}