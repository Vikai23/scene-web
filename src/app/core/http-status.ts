/** Nome oficial de cada status HTTP que a API usa, em inglês, como vem no campo error. */
export const STATUS_NAMES: Record<number, string> = {
  200: 'OK',
  201: 'Created',
  204: 'No Content',
  400: 'Bad Request',
  403: 'Forbidden',
  404: 'Not Found',
  405: 'Method Not Allowed',
  406: 'Not Acceptable',
  409: 'Conflict',
  415: 'Unsupported Media Type',
  422: 'Unprocessable Content',
  429: 'Too Many Requests',
  500: 'Internal Server Error',
};

export function statusText(status: number): string {
  return `${status} ${STATUS_NAMES[status] ?? ''}`.trim();
}
