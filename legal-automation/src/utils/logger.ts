import pino from 'pino';
import { config } from './config';

const isDev = config.isDev;

const pinoTransport = isDev
  ? pino.transport({
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'SYS:standard',
        ignore: 'pid,hostname',
      },
    })
  : pino.transport({
      target: 'pino/file',
      options: { destination: config.log_file },
    });

export const logger = pino(
  {
    level: config.log_level,
    timestamp: pino.stdTimeFunctions.isoTime,
  },
  isDev ? process.stdout : pinoTransport,
);

export function httpLogger() {
  const pinoHttp = require('pino-http');
  return pinoHttp({ logger });
}
