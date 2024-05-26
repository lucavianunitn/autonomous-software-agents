import { client } from "./Agent.js";

export async function actionMove(direction) {

    await client.move(direction);

}

export async function actionStealAndMove(direction) {

    await client.move(direction);
    await actionPutDown();
    await actionPickUp();

}

async function actionPickUp() {

    const pickUpResult = await client.pickup();

    let resultReward = 0;
    let carriedParcels = 0;
    pickUpResult.forEach(function(result){
        resultReward += result.reward;
        carriedParcels += 1;

    });

    return {
        resultReward : resultReward,
        carriedParcels : carriedParcels
    };

}

async function actionPutDown() {

    const putDownResult = await client.putdown();

}