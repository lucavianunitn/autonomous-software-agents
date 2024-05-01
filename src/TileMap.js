export class TileMap {

    #width;
    #height;

    #tiles = [];
    #deliveryTiles = [];

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
            
            if (delivery)
                this.#deliveryTiles.push({x:x,y:y});
        });

    }

    /**
     * Given a start and an end position, it returns
     * - erdos[end], so the distance between start and end (useful to understand if moving from start to end could worth it in certain scenarios)
     * - path, the sequence of cells I need to pass through to reach the end
     * - direction, the sequence of direction I need to follow to reach the end
     * 
     * If the first value returned (hopefully erdos[end]):
     * - is positive: the exists a path
     * - is 0: start == end
     * - is -1: there does not exist a path
     */
    pathBetweenTiles(start, end, agentsPerceived) {
        start = start.map(function(coordinate){ // to avoid that start contains partial positions
            return Math.round(coordinate);
        });
   
        const cols = this.#width;
        const rows = this.#height;
    
        const queue = [start];
        const visited = new Set(); // Mark visited cells
        const erdos = {[start]: 0};
        const previousCell = {};
        const agentsMap = this.createAgentsMap(agentsPerceived);

        visited.add(`${start[0]},${start[1]}`);
    
        while (queue.length > 0) {
            const [col, row] = queue.shift();
    
            if (col === end[0] && row === end[1]) { //SUCCESS, a path exists, now backtrack to store it
                const path = [];
                const direction = [];

                let current = end.join(','); // Convert current cell to string representation
                
                for(let i = 0; i < erdos[end]+1; i++) {
                    path.unshift(current.split(',').map(Number)); // path contains arrays

                    if(current !== start.join(',')) var [prevCol, prevRow] = previousCell[current]; // previousCell wants strings

                    if(path.length > 1){
                        const currentCol = path[0][0];
                        const currentRow = path[0][1];
                        const nextCol = path[1][0];
                        const nextRow = path[1][1];

                        if (currentCol == nextCol && (currentRow + 1) == nextRow) direction.unshift("up");
                        if (currentCol == nextCol && (currentRow - 1) == nextRow) direction.unshift("down");
                        if ((currentCol + 1) == nextCol && currentRow == nextRow) direction.unshift("right");
                        if ((currentCol - 1) == nextCol && currentRow == nextRow) direction.unshift("left");
                    }

                    current = `${prevCol},${prevRow}`;
                }

                return [erdos[end],path,direction];
            }
    
            for (const [dc, dr] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) { // the 4 directions I can move
                const newCol = col + dc;
                const newRow = row + dr;
    
                const newCell = `${newCol},${newRow}`;
                if (newCol >= 0 && newCol < cols && newRow >= 0 && newRow < rows 
                    && (this.#tiles[newCol][newRow]=="parcelSpawner" || this.#tiles[newCol][newRow]=="delivery") 
                    && !agentsMap[newCol][newRow]
                    && !visited.has(newCell)) {

                    queue.push([newCol, newRow]);
                    visited.add(newCell); // Mark new cell as visited
                    erdos[newCell] = erdos[`${col},${row}`] + 1;
                    previousCell[newCell] = [col, row];
                }
            }
        }
    
        return [-1,[],[]]; // No path found
    }
    
    createAgentsMap(agentsPerceived) {
        let agentsMap = [];

        const width = this.#width;
        const height = this.#height;

        for(let x=0; x<width; x++) {
            agentsMap[x] = new Array(height).fill(false);
        }

        for (let [key, value] of agentsPerceived) {
            const x = Math.round(value.x);
            const y = Math.round(value.y);

            agentsMap[x][y] = true;
        }

        return agentsMap;
    }

    getDeliveryTiles() {
        return this.#deliveryTiles;
    }

    getNearestDelivery(x, y, agentsPerceived) {

        let minDistance = Infinity;
        let coords = null;

        for (const deliveryTile of this.#deliveryTiles) {

            let [distance, path, distances] = this.pathBetweenTiles([x,y], [deliveryTile.x, deliveryTile.y], agentsPerceived);

            if (distance < minDistance && distance >= 0) { // second condition in order to avoid busy delivery tiles
                minDistance = distance;
                coords = {x:deliveryTile.x, y:deliveryTile.y};
            }

        }

        return [coords, minDistance];

    }

    /**
     * Returns a tile that is at the center or near it.
     */
    getCenteredTile() {

        let width = this.#width;
        let height = this.#height;
        let tiles = this.#tiles;

        let xCenter = Math.ceil(width/2) - 1;
        let yCenter = Math.ceil(height/2) - 1;

        if (tiles[xCenter][yCenter] === "parcelSpawner" || tiles[xCenter][yCenter] === "delivery")
            return {x:xCenter,y:yCenter};

        let visited = [];
        for (let x = 0; x < width; x++ ){
            visited[x] = [];
            for (let y = 0; y < height; y++){
                visited[x][y] = false;
            }
        }

        let dRow = [-1, 0, 1, 0 ];
        let dCol = [0, 1, 0, -1 ];

        let q = [];
 
        q.push([xCenter, yCenter]);
        visited[xCenter][yCenter] = true;

        while (q.length!=0) {
            
            let tile = q[0];
            let x = tile[0];
            let y = tile[1];

            q.shift();
            
            for (let i = 0; i < 4; i++) {
                
                let adjx = x + dRow[i];
                let adjy = y + dCol[i];
                
                if (this.#isValidBFS(visited, adjx, adjy)) {

                    if (tiles[adjx][adjy] === "parcelSpawner" || tiles[adjx][adjy] === "delivery")
                        return {x:adjx,y:adjy};

                    q.push([adjx, adjy ]);
                    visited[adjx][adjy] = true;
                }
            }
        }

        return null;
    }

    #isValidBFS(vis, row, col){

        if (row < 0 || col < 0 || row >= this.#width || col >= this.#height)
            return false;
     
        if (vis[row][col])
            return false;
     
        return true;
    }

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