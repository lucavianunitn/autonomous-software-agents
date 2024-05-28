import { client } from "./Agent.js";

export async function actionMove(direction) {

    await client.move(direction);
}

export async function actionStealAndMove(direction, intentionRevisionOnNewParcel = false) {
    const move_result = await client.move(direction)
    if (move_result === false) {
        throw "Agent cannot move, needed an IntentionRevision";
    }

    if(intentionRevisionOnNewParcel){
        const perceivedParcels = await new Promise((resolve, reject) => {
            client.onParcelsSensing((perceivedParcels) => {
                resolve(perceivedParcels);
            });
        });
          
        if (perceivedParcels.length > 0){
            throw "Agent perceived a new package, needed an IntentionRevision";
        }
    }

    await actionPutDown();
    await actionPickUp();

}

export async function actionPickUp() {

    const pickUpResult = await client.pickup();

}

export async function actionPutDown() {

    const putDownResult = await client.putdown();

}