import { normalizeAdAccountId, InsightsResponse, InsightsRequestParams, InsightReport } from './types';

/**
 * Получение метрик (insights) для рекламных объектов Facebook
 * 
 * @param accessToken Facebook API Access Token
 * @param adAccountId ID рекламного аккаунта
 * @param params Параметры запроса: level, objectIds, fields, datePreset
 * @returns Объект с метриками
 */
export async function getAdInsights(
    accessToken: string,
    adAccountId: string,
    params: InsightsRequestParams
): Promise<InsightsResponse> {
    try {
        // Нормализуем ID аккаунта
        const accountId = normalizeAdAccountId(adAccountId);
        console.log(`Using normalized Ad Account ID for insights: ${accountId}`);
        
        // API version
        const apiVersion = 'v22.0';
        
        // Формируем параметры запроса
        const queryParams = new URLSearchParams({
            access_token: accessToken
        });
        
        // Базовый URL для запроса insights
        let url = `https://graph.facebook.com/${apiVersion}/${accountId}/insights?${queryParams.toString()}`;
        
        // Добавляем уровень (level) к запросу
        if (params.level) {
            url += `&level=${params.level}`;
        }
        
        // Добавляем поля (fields) к запросу
        if (params.fields && params.fields.length > 0) {
            url += `&fields=${params.fields.join(',')}`;
        }
        
        // Добавляем временной диапазон (date_preset) к запросу
        if (params.datePreset) {
            url += `&date_preset=${params.datePreset}`;
        } else if (params.timeRange) {
            // Альтернативно можно указать конкретный диапазон дат
            const { since, until } = params.timeRange;
            url += `&time_range={'since':'${since}','until':'${until}'}`;
        }
        
        // Добавляем фильтр по IDs объектов, если указан
        if (params.objectIds && params.objectIds.length > 0) {
            // Для фильтрации по конкретным кампаниям/адсетам
            if (params.level === 'campaign') {
                url += `&filtering=[{'field':'campaign.id','operator':'IN','value':[${params.objectIds.map((id: string) => `'${id}'`).join(',')}]}]`;
            } else if (params.level === 'adset') {
                url += `&filtering=[{'field':'adset.id','operator':'IN','value':[${params.objectIds.map((id: string) => `'${id}'`).join(',')}]}]`;
            }
        }
        
        // Добавляем фильтр по статусу, если указан
        if (params.status) {
            url += `&filtering=[{'field':'effective_status','operator':'IN','value':[${params.status.map((status: string) => `'${status}'`).join(',')}]}]`;
        }
        
        console.log(`Requesting URL for insights: ${url.replace(accessToken, '[REDACTED]')}`);
        
        // Делаем запрос к API
        const response = await fetch(url);
        
        if (!response.ok) {
            const errorText = await response.text();
            console.error(`Facebook API Error Response: ${errorText}`);
            throw new Error(`Facebook API request failed: ${response.status} ${response.statusText}`);
        }
        
        const data = await response.json() as InsightsResponse;
        console.log(`Successfully fetched ${data.data?.length || 0} insights records.`);
        
        // Обработка пагинации, если много данных
        let allData = [...(data.data || [])];
        let nextPage = data.paging?.next;
        
        // Если есть следующая страница, запрашиваем ее
        while (nextPage) {
            console.log(`Fetching next page of insights: ${nextPage.replace(accessToken, '[REDACTED]')}`);
            
            const nextResponse = await fetch(nextPage);
            
            if (!nextResponse.ok) {
                console.error(`Error fetching next page: ${nextResponse.status} ${nextResponse.statusText}`);
                break;
            }
            
            const nextData = await nextResponse.json() as InsightsResponse;
            allData = [...allData, ...(nextData.data || [])];
            nextPage = nextData.paging?.next;
            
            console.log(`Added ${nextData.data?.length || 0} more insights records. Total: ${allData.length}`);
        }
        
        // Возвращаем все данные
        return {
            data: allData,
            paging: data.paging
        };
    } catch (error) {
        console.error('Error fetching ad insights:', error);
        throw error;
    }
}

/**
 * Преобразование метрик в более удобный формат для анализа
 * 
 * @param insights Исходные метрики от Facebook API
 * @returns Преобразованный отчет по метрикам
 */
export function processInsightsData(insights: InsightsResponse): InsightReport[] {
    return insights.data?.map((insight: any) => {
        // Базовая информация
        const report: InsightReport = {
            id: insight.campaign_id || insight.adset_id || insight.ad_id || '',
            name: insight.campaign_name || insight.adset_name || insight.ad_name || '',
            date_start: insight.date_start,
            date_stop: insight.date_stop,
            metrics: {}
        };
        
        // Добавляем все доступные метрики
        Object.keys(insight).forEach(key => {
            // Пропускаем служебные поля и названия
            if (!['campaign_id', 'campaign_name', 'adset_id', 'adset_name', 'ad_id', 'ad_name', 'date_start', 'date_stop'].includes(key)) {
                report.metrics[key] = insight[key];
            }
        });
        
        return report;
    }) || [];
}
