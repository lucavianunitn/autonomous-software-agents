export class TileMap {

    #width;
    #height;

    #tiles = [];

    constructor(width, height, tiles) {

        this.#width = width;
        this.#height = height;

        for(let x=0; x<width; x++) {
            this.#tiles[x] = new Array(height);
        }

        tiles.forEach( tile => {

            let x = tile["x"];
            let y = tile["y"];
            let delivery = tile["delivery"];
            let parcelSpawner = tile["parcelSpawner"];

            this.#tiles[x][y] = delivery ? "delivery" : parcelSpawner ? "parcelSpawner" : "empty";
        });

    }

}