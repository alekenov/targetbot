import { DurableObject } from "cloudflare:workers";
import { getCampaigns } from './facebookApi';
import { syncPhoneAudience } from './audienceManager';

/**
 * Welcome to Cloudflare Workers! This is your first Durable Objects application.
 *
 * - Run `npm run dev` in your terminal to start a development server
 * - Open a browser tab at http://localhost:8787/ to see your Durable Object in action
 * - Run `npm run deploy` to publish your application
 *
 * Bind resources to your worker in `wrangler.jsonc`. After adding bindings, a type definition for the
 * `Env` object can be regenerated with `npm run cf-typegen`.
 *
 * Learn more at https://developers.cloudflare.com/durable-objects
 */


/** A Durable Object's behavior is defined in an exported Javascript class */
export class MyDurableObject extends DurableObject {
	/**
	 * The constructor is invoked once upon creation of the Durable Object, i.e. the first call to
	 * 	`DurableObjectStub::get` for a given identifier (no-op constructors can be omitted)
	 *
	 * @param ctx - The interface for interacting with Durable Object state
	 * @param env - The interface to reference bindings declared in wrangler.jsonc
	 */
	constructor(ctx: DurableObjectState, env: Env) {
		super(ctx, env);
	}

	/**
	 * The Durable Object exposes an RPC method sayHello which will be invoked when when a Durable
	 *  Object instance receives a request from a Worker via the same method invocation on the stub
	 *
	 * @param name - The name provided to a Durable Object instance from a Worker
	 * @returns The greeting to be sent back to the Worker
	 */
	async sayHello(name: string): Promise<string> {
		return `Hello, ${name}!`;
	}
}

export interface Env {
	// Example binding to KV. Learn more at https://developers.cloudflare.com/workers/runtime-apis/kv/
	// MY_KV_NAMESPACE: KVNamespace;
	//
	// Example binding to Durable Object. Learn more at https://developers.cloudflare.com/workers/runtime-apis/durable-objects/
	MY_DURABLE_OBJECT: DurableObjectNamespace;
	//
	// Example binding to R2. Learn more at https://developers.cloudflare.com/workers/runtime-apis/r2/
	// MY_BUCKET: R2Bucket;
	//
	// Example binding to a Service. Learn more at https://developers.cloudflare.com/workers/runtime-apis/service-bindings/
	// MY_SERVICE: Fetcher;
	//
	// Example binding to a Queue. Learn more at https://developers.cloudflare.com/queues/javascript-apis/
	// MY_QUEUE: Queue;
	//
	// Example binding to D1. Learn more at https://developers.cloudflare.com/workers/platform/bindings/d1-database-bindings/
	// DB: D1Database

	// Secrets for Facebook API
	FB_ACCESS_TOKEN: string;
	FB_AD_ACCOUNT_ID: string;

	// KV namespace for caching audience IDs
	AUDIENCE_CACHE: KVNamespace;

	// Binding for Assets, added by wrangler init
	ASSETS: Fetcher;
}

export default {
	/**
	 * This is the standard fetch handler for a Cloudflare Worker
	 * @param request The request object
	 * @param env The environment object
	 * @param ctx The execution context
	 * @returns The response to be sent back to the client
	 */
	async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
		console.log('Worker fetch handler started.');

		// URL object for parsing the request
		const url = new URL(request.url);
		const path = url.pathname;

		// Check if secrets are available
		if (!env.FB_ACCESS_TOKEN || !env.FB_AD_ACCOUNT_ID) {
			console.error('Error: FB_ACCESS_TOKEN or FB_AD_ACCOUNT_ID secrets are not set.');
			return new Response(JSON.stringify({ error: 'Missing Facebook API secrets configuration.' }), {
				status: 500,
				headers: { 'Content-Type': 'application/json' },
			});
		}

		try {
			// Handle different API routes
			if (path === '/api/campaigns') {
				// Normalize Ad Account ID in case it includes an accidental 'FB_ACCOUNT_ID=' prefix
				const rawAdAccountId = env.FB_AD_ACCOUNT_ID;
				const adAccountId = rawAdAccountId.includes('=')
					? rawAdAccountId.split('=')[1]
					: rawAdAccountId;
				console.log(`Normalized Ad Account ID (starts with): ${adAccountId.substring(0, 15)}...`);
				console.log('Attempting to fetch Facebook campaigns...');
				const campaignsResponse = await getCampaigns(env.FB_ACCESS_TOKEN, adAccountId);
				const campaignCount = campaignsResponse.data?.length || 0;
				console.log(`Successfully fetched ${campaignCount} campaigns from Facebook.`);

				// Return the list of campaigns
				return new Response(JSON.stringify({
					success: true,
					message: `Fetched ${campaignCount} campaigns.`,
					data: campaignsResponse.data
				}), {
					headers: { 'Content-Type': 'application/json' },
				});
			}
			else if (path === '/api/sync-audience') {
				// Sync audience with phone numbers
				const result = await syncPhoneAudience(env);

				return new Response(JSON.stringify({
					success: result.success,
					message: result.message
				}), {
					headers: { 'Content-Type': 'application/json' },
				});
			}
			// Home page or other routes
			else {
				return new Response(JSON.stringify({
					success: true,
					message: 'Facebook Ads Automator API',
					endpoints: [
						'/api/campaigns',
						'/api/sync-audience'
					]
				}), {
					headers: { 'Content-Type': 'application/json' },
				});
			}
		} catch (error) {
			console.error('Error during API call:', error);
			// Determine the type of error for a more specific message if needed
			const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
			return new Response(JSON.stringify({
				success: false,
				error: `Request failed: ${errorMessage}`
			}), {
				status: 500,
				headers: { 'Content-Type': 'application/json' },
			});
		}
	},

	/**
	 * Scheduled handler for running on a schedule
	 * Triggered by cron-trigger in wrangler.jsonc
	 */
	async scheduled(controller: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
		console.log('Running scheduled task at:', controller.scheduledTime);

		try {
			// Sync audience with phone numbers
			console.log('Starting scheduled audience sync...');
			const syncResult = await syncPhoneAudience(env);
			console.log('Scheduled audience sync completed:', syncResult);
		} catch (error) {
			console.error('Error in scheduled task:', error);
		}
	}
} satisfies ExportedHandler<Env>;

// The Durable Object class definition remains below, as generated by the template.
// It's not used by the fetch handler in this iteration.
