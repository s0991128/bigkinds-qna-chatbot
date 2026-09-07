export type RateLimiter = {
  claim(key: string, limit: number, now?: Date): boolean;
};

export function createInMemoryRateLimiter(): RateLimiter {
  const counters = new Map<string, { day: string; count: number }>();

  return {
    claim(key, limit, now = new Date()) {
      const day = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(now);
      const current = counters.get(key);
      const count = current?.day === day ? current.count : 0;
      if (count >= limit) return false;
      counters.set(key, { day, count: count + 1 });
      return true;
    },
  };
}
