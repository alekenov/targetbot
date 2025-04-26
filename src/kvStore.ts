/**
 * Утилиты для работы с Cloudflare KV Store
 */

/**
 * Получает значение по ключу из KV Store
 * @param kv - KV Namespace
 * @param key - Ключ
 * @returns Значение или null, если ключ не найден
 */
export async function get(kv: KVNamespace, key: string): Promise<string | null> {
	try {
		return await kv.get(key);
	} catch (error) {
		console.error(`Error getting key ${key} from KV:`, error);
		return null;
	}
}

/**
 * Записывает значение по ключу в KV Store
 * @param kv - KV Namespace
 * @param key - Ключ
 * @param value - Значение для записи
 * @param expirationTtl - Время жизни записи в секундах (опционально)
 * @returns true, если запись успешна
 */
export async function put(
	kv: KVNamespace, 
	key: string, 
	value: string, 
	expirationTtl?: number
): Promise<boolean> {
	try {
		const options = expirationTtl ? { expirationTtl } : undefined;
		await kv.put(key, value, options);
		return true;
	} catch (error) {
		console.error(`Error putting key ${key} to KV:`, error);
		return false;
	}
}

/**
 * Удаляет значение по ключу из KV Store
 * @param kv - KV Namespace
 * @param key - Ключ для удаления
 * @returns true, если удаление успешно
 */
export async function del(kv: KVNamespace, key: string): Promise<boolean> {
	try {
		await kv.delete(key);
		return true;
	} catch (error) {
		console.error(`Error deleting key ${key} from KV:`, error);
		return false;
	}
}
