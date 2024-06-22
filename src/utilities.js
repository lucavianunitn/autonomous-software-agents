/**
 * shuffle an array.
 * @param {*} array 
 */
export function shuffle(array) {
  for (let i = array.length - 1; i > 0; i--) {
    let j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
}

/**
 * executes an async function 'task' and awaites the result for the given timeLimit.
 * original source : https://medium.com/swlh/set-a-time-limit-on-async-actions-in-javascript-567d7ca018c2
 * @param {*} timeLimit timeout in milliseconds.
 * @param {*} task async function to execute.
 * @param {*} timeoutValue value to return in case of timeout.
 * @returns 
 */
export async function timedAwait(timeLimit, task, timeoutValue){
  let timeout;
  const timeoutPromise = new Promise((resolve, reject) => {
      timeout = setTimeout(() => {
          resolve(timeoutValue);
      }, timeLimit);
  });
  const response = await Promise.race([task, timeoutPromise]);
  if(timeout){ //the code works without this but let's be safe and clean up the timeout
      clearTimeout(timeout);
  }
  return response;
}