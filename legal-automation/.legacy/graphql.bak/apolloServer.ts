/**
 * Apollo Server Configuration
 * Sets up GraphQL API with schema, resolvers, and WebSocket subscriptions
 */

import { ApolloServer } from 'apollo-server-express';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { makeExecutableSchema } from '@graphql-tools/schema';
import { WebSocketServer } from 'ws';
import { useServer } from 'graphql-ws/lib/use-ws';
import { queryResolvers } from './resolvers/queryResolvers';
import { mutationResolvers } from './resolvers/mutationResolvers';
import { subscriptionResolvers } from './resolvers/subscriptionResolvers';
import { logger } from '@utils/logger';
import type { Express } from 'express';
import type { Server as HTTPServer } from 'http';

/**
 * Load GraphQL schema from file
 */
function loadSchema(): string {
  const schemaPath = resolve(__dirname, './schema.graphql');
  return readFileSync(schemaPath, 'utf-8');
}

/**
 * Merge all resolvers
 */
function mergeResolvers() {
  return {
    Query: queryResolvers.Query,
    Mutation: mutationResolvers.Mutation,
    Subscription: subscriptionResolvers.Subscription,
  };
}

/**
 * Initialize Apollo Server
 */
export async function initializeApolloServer(
  app: Express,
  httpServer: HTTPServer,
): Promise<ApolloServer> {
  try {
    // Load schema and resolvers
    const typeDefs = loadSchema();
    const resolvers = mergeResolvers();

    // Create executable schema
    const schema = makeExecutableSchema({
      typeDefs,
      resolvers,
    });

    // Create WebSocket server for subscriptions
    const wsServer = new WebSocketServer({
      server: httpServer,
      path: '/graphql/subscriptions',
    });

    // Create Apollo Server instance
    const apolloServer = new ApolloServer({
      schema,
      plugins: {
        // Handle server startup
        async serverWillStart() {
          logger.info('Apollo Server starting');
          return {
            async drainServer() {
              await serverCleanup.dispose();
            },
          };
        },

        // Handle connection
        async didResolveOperation(context: any) {
          if (context.request.headers.authorization) {
            const token = context.request.headers.authorization.replace('Bearer ', '');
            context.token = token;
            logger.debug({ userId: context.userId }, 'GraphQL request authenticated');
          }
        },

        // Handle errors
        async didEncounterErrors(context: any) {
          context.errors?.forEach((error: any) => {
            logger.error(
              {
                error: error.message,
                path: error.path,
                locations: error.locations,
              },
              'GraphQL error',
            );
          });
        },
      },
      context: async ({ req, connection }) => {
        if (connection) {
          return connection.context;
        }
        return {
          userId: req?.user?.id,
          token: req?.headers.authorization?.replace('Bearer ', ''),
          traceId: req?.headers['x-trace-id'],
        };
      },
      formatError: (error: any) => {
        return {
          message: error.message,
          extensions: {
            code: error.extensions?.code || 'INTERNAL_SERVER_ERROR',
            traceId: error.extensions?.traceId,
          },
        };
      },
    });

    // Setup WebSocket subscriptions
    const serverCleanup = useServer(
      {
        schema,
        context: async (ctx: any) => {
          const token = ctx.connectionParams?.authorization?.replace('Bearer ', '');
          return {
            userId: ctx.connectionParams?.userId,
            token,
            traceId: ctx.connectionParams?.traceId,
          };
        },
        onConnect: (ctx: any) => {
          logger.info('WebSocket connection established for GraphQL subscriptions');
        },
        onDisconnect: (ctx: any) => {
          logger.info('WebSocket connection closed for GraphQL subscriptions');
        },
        onError: (ctx: any, msg: any, errors: any) => {
          logger.error(
            {
              errors: errors.map((e: any) => e.message),
            },
            'GraphQL subscription error',
          );
        },
      },
      wsServer,
    );

    // Start the server
    await apolloServer.start();
    logger.info('Apollo Server initialized successfully');

    return apolloServer;
  } catch (error) {
    logger.error({ error }, 'Failed to initialize Apollo Server');
    throw error;
  }
}

/**
 * Setup GraphQL middleware
 */
export function setupGraphQLMiddleware(app: Express, apolloServer: ApolloServer) {
  apolloServer.createHandler({
    path: '/graphql',
  })(app);

  logger.info('GraphQL middleware configured on /graphql');
}
