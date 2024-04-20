export class TileMap {

    #width;
    #height;

    #tiles = [];

    constructor(width, height, tiles) {

        this.#width = width;
        this.#height = height;

        for(let x=0; x<width; x++) {
            this.#tiles[x] = new Array(height).fill("empty");
        }

        tiles.forEach( tile => {

            let x = tile["x"];
            let y = tile["y"];
            let delivery = tile["delivery"];
            /**
             * Seems that it isn't needed to check parcelSpawner given the fact that tiles
             * can be of type "delivery" or "parcelSpawner" (mutually exclusive)
             */
            let parcelSpawner = tile["parcelSpawner"];

            this.#tiles[x][y] = delivery ? "delivery" : "parcelSpawner";
        });

    }

    // TODO: add function to find shortest path between two tiles.

    printDebug() {

        console.log("TileMap {");
        console.log(`- width = ${this.#width}`);
        console.log(`- heigth = ${this.#height}`);

        for (let x = 0; x < this.#width; x++) {

            for (let y = 0; y < this.#height; y++) {

                console.log(`- tiles[${x}][${y}] = ${this.#tiles[x][y]}`);

            }

        }

        console.log("}");
        console.log();

    }

}