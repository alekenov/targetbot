/**
 * Общие типы и интерфейсы для Facebook API
 */

// Интерфейс для окружения Worker'а
export interface Env {
	// Секреты для Facebook API
	FB_ACCESS_TOKEN: string;
	FB_AD_ACCOUNT_ID: string;
	
	// KV namespace для кэширования ID аудиторий
	AUDIENCE_CACHE: KVNamespace;
	
	// Binding for Assets, added by wrangler init
	ASSETS: Fetcher;
}

// Интерфейс для описания структуры кампаний
export interface Campaign {
	id: string;
	name: string;
	status: string;
}

export interface CampaignsResponse {
	data: Campaign[];
	paging?: {
		cursors: {
			before: string;
			after: string;
		};
		next?: string;
	};
}

// Интерфейсы для работы с аудиториями
export interface CustomAudienceResponse {
	id: string;
	name: string;
	subtype: string;
	description?: string;
	approximate_count?: number;
	time_created?: string;
	time_updated?: string;
}

export interface CustomAudiencesListResponse {
	data: CustomAudienceResponse[];
	paging?: {
		cursors: {
			before: string;
			after: string;
		};
		next?: string;
	};
}

// Интерфейсы для ответов API при создании/обновлении аудиторий
export interface CreateAudienceResponse {
	id: string;
	[key: string]: any;
}

export interface UpdateAudienceResponse {
	audience_id: string;
	num_received?: number;
	num_invalid_entries?: number;
	[key: string]: any;
}

/**
 * Утилиты для нормализации параметров запросов
 */

/**
 * Нормализует ID рекламного аккаунта, убирая возможные префиксы
 * @param adAccountId ID рекламного аккаунта
 * @returns Нормализованный ID
 */
export function normalizeAdAccountId(adAccountId: string): string {
	return adAccountId.includes('=') ? adAccountId.split('=')[1] : adAccountId;
}
