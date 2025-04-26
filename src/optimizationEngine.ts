/**
 * Модуль для анализа и оптимизации рекламных кампаний
 * на основе собранных метрик
 */

import { getAdInsights, processInsightsData } from './facebookApi/insights';
import { getCampaigns } from './facebookApi/campaigns';
import { InsightReport, MetricsStorageItem, Env } from './facebookApi/types';

/**
 * Ключи для хранения данных в KV
 */
const KV_KEYS = {
  LAST_METRICS: 'last_metrics',
  METRICS_HISTORY: 'metrics_history',
  ACTIVE_CAMPAIGNS: 'active_campaigns'
};

/**
 * Получает метрики для всех активных кампаний
 * 
 * @param env Окружение с необходимыми переменными и привязками
 * @returns Объект с метриками и сводной информацией
 */
export async function fetchMetrics(env: Env): Promise<{
  success: boolean;
  message: string;
  data?: MetricsStorageItem;
}> {
  try {
    console.log('Starting metrics collection process');
    
    // Получаем список активных кампаний
    const campaigns = await getCampaigns(env.FB_ACCESS_TOKEN, env.FB_AD_ACCOUNT_ID);
    const activeCampaigns = campaigns.data.filter(campaign => campaign.status === 'ACTIVE');
    
    if (activeCampaigns.length === 0) {
      return {
        success: true,
        message: 'No active campaigns found.'
      };
    }
    
    console.log(`Found ${activeCampaigns.length} active campaigns.`);
    
    // Сохраняем ID активных кампаний
    const activeCampaignIds = activeCampaigns.map(campaign => campaign.id);
    await env.AUDIENCE_CACHE.put(KV_KEYS.ACTIVE_CAMPAIGNS, JSON.stringify(activeCampaignIds));
    
    // Получаем метрики для активных кампаний
    const insightsResponse = await getAdInsights(env.FB_ACCESS_TOKEN, env.FB_AD_ACCOUNT_ID, {
      level: 'campaign',
      objectIds: activeCampaignIds,
      fields: [
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
      ],
      datePreset: 'last_7d'  // получаем данные за последние 7 дней
    });
    
    // Обрабатываем полученные метрики
    const processedInsights = processInsightsData(insightsResponse);
    
    if (processedInsights.length === 0) {
      return {
        success: true,
        message: 'No metrics data available for the active campaigns.'
      };
    }
    
    // Создаем сводную информацию
    const summary = calculateMetricsSummary(processedInsights);
    
    // Формируем объект для хранения
    const metricsData: MetricsStorageItem = {
      timestamp: Date.now(),
      insights: processedInsights,
      summary
    };
    
    // Сохраняем метрики в KV
    await env.AUDIENCE_CACHE.put(KV_KEYS.LAST_METRICS, JSON.stringify(metricsData));
    
    // Сохраняем метрики в историю (опционально, если нужна история)
    // Для этого можно использовать массив или префиксы с датами
    // Пример: await env.AUDIENCE_CACHE.put(`${KV_KEYS.METRICS_HISTORY}_${new Date().toISOString().split('T')[0]}`, JSON.stringify(metricsData));
    
    return {
      success: true,
      message: `Successfully collected metrics for ${processedInsights.length} campaigns.`,
      data: metricsData
    };
    
  } catch (error) {
    console.error('Error in fetchMetrics:', error);
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Unknown error occurred while fetching metrics.'
    };
  }
}

/**
 * Получает последние сохраненные метрики из KV хранилища
 * 
 * @param env Окружение с необходимыми переменными и привязками
 * @returns Объект с метриками или сообщение об ошибке
 */
export async function getStoredMetrics(env: Env): Promise<{
  success: boolean;
  message: string;
  data?: MetricsStorageItem;
  lastUpdated?: string;
}> {
  try {
    const storedMetricsJson = await env.AUDIENCE_CACHE.get(KV_KEYS.LAST_METRICS);
    
    if (!storedMetricsJson) {
      return {
        success: false,
        message: 'No metrics data found. Please run metrics collection first.'
      };
    }
    
    const metricsData = JSON.parse(storedMetricsJson) as MetricsStorageItem;
    const lastUpdated = new Date(metricsData.timestamp).toLocaleString();
    
    return {
      success: true,
      message: `Retrieved metrics last updated at ${lastUpdated}`,
      data: metricsData,
      lastUpdated
    };
    
  } catch (error) {
    console.error('Error in getStoredMetrics:', error);
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Unknown error occurred while retrieving metrics.'
    };
  }
}

/**
 * Рассчитывает сводную информацию на основе метрик
 * 
 * @param insights Массив отчетов по метрикам
 * @returns Объект со сводными показателями
 */
function calculateMetricsSummary(insights: InsightReport[]): MetricsStorageItem['summary'] {
  // Инициализируем значения
  let totalSpend = 0;
  let totalImpressions = 0;
  let totalClicks = 0;
  let totalConversions = 0;
  
  // Суммируем значения из всех отчетов
  insights.forEach(report => {
    // Безопасный доступ к числовым значениям метрик
    totalSpend += parseFloat(report.metrics.spend) || 0;
    totalImpressions += parseInt(report.metrics.impressions) || 0;
    totalClicks += parseInt(report.metrics.clicks) || 0;
    
    // Конверсии могут быть в разных местах, в зависимости от настройки кампании
    // Пример: actions может содержать массив с различными типами действий
    if (report.metrics.actions && Array.isArray(report.metrics.actions)) {
      const conversions = report.metrics.actions.find(
        (action: any) => 
          action.action_type === 'purchase' || 
          action.action_type === 'lead' ||
          action.action_type === 'complete_registration'
      );
      
      if (conversions) {
        totalConversions += parseInt(conversions.value) || 0;
      }
    }
  });
  
  // Рассчитываем производные метрики
  const avgCTR = totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : 0;
  const avgCPC = totalClicks > 0 ? totalSpend / totalClicks : 0;
  const avgCPM = totalImpressions > 0 ? (totalSpend / totalImpressions) * 1000 : 0;
  const avgCPA = totalConversions > 0 ? totalSpend / totalConversions : 0;
  
  return {
    totalSpend,
    totalImpressions,
    totalClicks,
    totalConversions,
    avgCTR,
    avgCPC,
    avgCPM,
    avgCPA
  };
}

/**
 * Запускает полный цикл сбора и анализа метрик
 * 
 * @param env Окружение с необходимыми переменными и привязками
 * @returns Результат выполнения операции
 */
export async function runMetricsAnalysis(env: Env): Promise<{
  success: boolean;
  message: string;
  data?: any;
}> {
  try {
    // Получаем актуальные метрики
    const fetchResult = await fetchMetrics(env);
    
    if (!fetchResult.success || !fetchResult.data) {
      return fetchResult;
    }
    
    // Тут можно добавить дополнительный анализ метрик,
    // например, сравнение с предыдущими периодами,
    // выявление трендов и т.д.
    
    // Возвращаем результат
    return {
      success: true,
      message: 'Successfully collected and analyzed metrics.',
      data: {
        metrics: fetchResult.data,
        // Можно добавить дополнительные сведения по результатам анализа
        insightsCount: fetchResult.data.insights.length,
        dateRange: fetchResult.data.insights[0] ? 
          `${fetchResult.data.insights[0].date_start} to ${fetchResult.data.insights[0].date_stop}` : 
          'Unknown'
      }
    };
    
  } catch (error) {
    console.error('Error in runMetricsAnalysis:', error);
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Unknown error occurred during metrics analysis.'
    };
  }
}
