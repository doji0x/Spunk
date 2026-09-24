/** Bounds waiting only; it does not cancel wallet/SDK work or retry it. */
export default function atomicV1Timeout(operation, milliseconds, message, stage) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(Object.assign(new Error(message), {
      code: 'TIMEOUT', stage,
    })), milliseconds);
  });
  return Promise.race([operation, timeout]).finally(() => clearTimeout(timer));
}