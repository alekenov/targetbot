import { DurableObject } from "cloudflare:workers";
import { getCampaigns, getCustomAudiences, createCustomAudience } from './facebookApi';
import { getAdInsights } from './facebookApi/insights';
import { syncPhoneAudience, createPhoneLookalikeAudience } from './audienceManager';
import { fetchMetrics, getStoredMetrics, runMetricsAnalysis } from './optimizationEngine';

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
			else if (path === '/api/create-lookalike') {
				// Create Lookalike audience based on existing one
				const result = await createPhoneLookalikeAudience(env);

				return new Response(JSON.stringify({
					success: result.success,
					message: result.message,
					audienceId: result.audienceId
				}), {
					headers: { 'Content-Type': 'application/json' },
				});
			}
			else if (path === '/api/create-test-audience') {
				try {
					// Создаем тестовую аудиторию с минимальными параметрами
					const audienceName = "Test Audience API v22";
					const audienceDescription = "Тестовая аудитория, созданная через API v22.0";
					
					console.log(`Создание тестовой аудитории: ${audienceName}`);
					
					const audienceId = await createCustomAudience(
						audienceName,
						audienceDescription,
						env.FB_ACCESS_TOKEN,
						env.FB_AD_ACCOUNT_ID,
						env
					);
					
					return new Response(JSON.stringify({
						success: true,
						message: `Аудитория "${audienceName}" успешно создана`,
						audienceId
					}), {
						headers: { 'Content-Type': 'application/json' },
					});
				} catch (error) {
					console.error("Error during API call:", error);
					
					return new Response(JSON.stringify({
						success: false,
						message: error instanceof Error ? error.message : 'Неизвестная ошибка'
					}), {
						headers: { 'Content-Type': 'application/json' },
					});
				}
			}
			else if (path === '/api/audiences') {
				// Получение списка всех аудиторий
				// Normalize Ad Account ID in case it includes an accidental 'FB_ACCOUNT_ID=' prefix
				const rawAdAccountId = env.FB_AD_ACCOUNT_ID;
				const adAccountId = rawAdAccountId.includes('=')
					? rawAdAccountId.split('=')[1]
					: rawAdAccountId;
				
				console.log('Fetching list of all Custom Audiences...');
				const audiencesResponse = await getCustomAudiences(env.FB_ACCESS_TOKEN, adAccountId);
				
				// Преобразуем список аудиторий для API ответа - упрощаем структуру
				const processedAudiences = audiencesResponse.data.map(audience => ({
					id: audience.id,
					name: audience.name,
					type: audience.subtype || 'Unknown',
					description: audience.description || ''
				}));
				
				return new Response(JSON.stringify({
					success: true,
					message: `Fetched ${processedAudiences.length} audiences.`,
					data: processedAudiences
				}), {
					headers: { 'Content-Type': 'application/json' },
				});
			}
			else if (path === '/api/insights') {
				// Получение свежих метрик кампаний
				const rawAdAccountId = env.FB_AD_ACCOUNT_ID;
				const adAccountId = rawAdAccountId.includes('=')
					? rawAdAccountId.split('=')[1]
					: rawAdAccountId;
				
				// Получаем параметры запроса из URL
				const queryParams = new URL(request.url).searchParams;
				const level = queryParams.get('level') || 'campaign';
				const datePreset = queryParams.get('date_preset') || 'last_7d';
				const campaignIds = queryParams.get('campaign_ids'); // опционально
				
				// Формируем список полей для запроса метрик
				const fields = [
					'campaign_name',
					'impressions',
					'clicks',
					'spend',
					'reach',
					'cpm',
					'cpc',
					'ctr',
					'unique_clicks',
					'frequency',
					'actions',
					'action_values',
					'cost_per_action_type'
				];
				
				// Опциональная фильтрация по ID кампаний
				const objectIds = campaignIds ? campaignIds.split(',') : undefined;
				
				console.log(`Fetching insights data for level: ${level}, date_preset: ${datePreset}`);
				const insightsResponse = await getAdInsights(env.FB_ACCESS_TOKEN, adAccountId, {
					level: level as 'campaign' | 'adset' | 'ad',
					fields,
					datePreset: datePreset as any,
					objectIds
				});
				
				return new Response(JSON.stringify({
					success: true,
					message: `Fetched insights for ${insightsResponse.data?.length || 0} items.`,
					data: insightsResponse.data
				}), {
					headers: { 'Content-Type': 'application/json' },
				});
			}
			else if (path === '/api/metrics/collect') {
				// Запуск сбора и сохранения метрик
				console.log('Starting metrics collection and analysis...');
				const result = await runMetricsAnalysis(env);
				
				return new Response(JSON.stringify({
					success: result.success,
					message: result.message,
					data: result.data
				}), {
					headers: { 'Content-Type': 'application/json' },
				});
			}
			else if (path === '/api/metrics/latest') {
				// Получение последних сохраненных метрик
				console.log('Retrieving latest stored metrics...');
				const result = await getStoredMetrics(env);
				
				return new Response(JSON.stringify({
					success: result.success,
					message: result.message,
					lastUpdated: result.lastUpdated,
					data: result.data
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
						'/api/sync-audience',
						'/api/create-lookalike',
						'/api/create-test-audience',
						'/api/audiences',
						'/api/insights',
						'/api/metrics/collect',
						'/api/metrics/latest'
					],
					documentation: 'Visit /api/[endpoint] to use specific features'
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
			
			// Если синхронизация аудитории с телефонами прошла успешно,
			// создаем Lookalike аудиторию на ее основе
			if (syncResult.success) {
				console.log('Starting scheduled Lookalike audience creation...');
				const lookalikeResult = await createPhoneLookalikeAudience(env);
				console.log('Scheduled Lookalike audience creation completed:', lookalikeResult);
			} else {
				console.log('Skipping Lookalike audience creation due to failed audience sync');
			}
		} catch (error) {
			console.error('Error in scheduled task:', error);
		}
	}
} satisfies ExportedHandler<Env>;

// The Durable Object class definition remains below, as generated by the template.
// It's not used by the fetch handler in this iteration.
