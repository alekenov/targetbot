/**
 * Модуль для работы с кампаниями Facebook Ads API
 */

import { CampaignsResponse, normalizeAdAccountId } from './types';

/**
 * Получает список кампаний из Facebook Ads API.
 * @param accessToken - Токен доступа пользователя Facebook.
 * @param adAccountId - ID рекламного аккаунта (в формате act_...).
 * @returns Промис, который разрешается объектом с данными кампаний.
 */
export async function getCampaigns(accessToken: string, adAccountId: string): Promise<CampaignsResponse> {
	const apiVersion = 'v22.0'; // Используем актуальную версию API
	const fields = 'name,status'; // Запрашиваемые поля
	// Нормализуем ID аккаунта в случае, если он содержит префикс
	const accountId = normalizeAdAccountId(adAccountId);
	const url = `https://graph.facebook.com/${apiVersion}/${accountId}/campaigns?fields=${fields}&access_token=${accessToken}`;

	console.log(`Requesting URL: ${url.replace(accessToken, '[REDACTED]')}`); // Логируем URL без токена

	try {
		const response = await fetch(url);

		if (!response.ok) {
			const errorTextContent = await response.text();
			console.error(`Facebook API Error Response: ${errorTextContent}`);
			throw new Error(`Facebook API request failed: ${response.status} ${response.statusText}`);
		}

		const data: CampaignsResponse = await response.json();
		console.log(`Successfully fetched ${data.data?.length || 0} campaigns.`);
		return data;

	} catch (error) {
		console.error('Error fetching campaigns:', error);
		// Перебрасываем ошибку для обработки выше
		throw error;
	}
}
