// utils.js — 纯工具函数，无副作用，谁都能调
// 术语速讲：**纯函数（pure function）**：输入决定输出，不读不写外部状态。
// 这层通常是项目里最稳的部分，可以放心改、放心测试。

(function (global) {
    'use strict';

    /**
     * 格式化价格：把数字变成 "¥888" / "$120" / "¥1,234" 这种带千分位的串。
     * @param {number} amount
     * @param {string} currency - 'CNY' | 'USD' | 'EUR' | 'JPY' | ...
     * @returns {string}
     */
    function formatPrice(amount, currency) {
        if (typeof amount !== 'number' || isNaN(amount)) return '—';

        // 货币符号 + 千分位
        const symbols = {
            CNY: '¥',
            USD: '$',
            EUR: '€',
            JPY: '¥',
            GBP: '£',
            HKD: 'HK$',
        };
        const symbol = symbols[currency] || (currency + ' ');
        const formatted = Math.round(amount).toLocaleString('en-US');
        return symbol + formatted;
    }

    /**
     * 从一组报价里找出最低价的那条，返回它的 index。
     * 口径：必须是 **精确价**（非估算）才参与最低价比较；估算价只展示，不抢"最低"标签。
     * @param {Array<{price:number, isEstimate?:boolean}>} quotes
     * @returns {number} 最低价的 index；都估算或空数组则返回 -1
     */
    function findLowestIndex(quotes) {
        let lowestIdx = -1;
        let lowestVal = Infinity;
        for (let i = 0; i < quotes.length; i++) {
            const q = quotes[i];
            if (q.isEstimate) continue;        // 估算价不参与
            if (typeof q.price !== 'number' || isNaN(q.price)) continue;
            if (q.price < lowestVal) {
                lowestVal = q.price;
                lowestIdx = i;
            }
        }
        return lowestIdx;
    }

    /**
     * 把报价按房型分组，相同 roomType 合成一组。
     * @param {Array<Object>} quotes
     * @returns {Array<{roomType:string, quotes:Array<Object>}>}
     */
    function groupByRoomType(quotes) {
        const map = new Map();
        for (const q of quotes) {
            const key = q.roomType || '其他房型';
            if (!map.has(key)) map.set(key, []);
            map.get(key).push(q);
        }
        return Array.from(map.entries()).map(([roomType, items]) => ({
            roomType,
            quotes: items,
        }));
    }

    /**
     * 按价格排序（保留原数组顺序作为兜底）。**估算价** 永远排到末尾（不论升降序）。
     * @param {Array<{price:number, isEstimate?:boolean}>} quotes
     * @param {'default'|'asc'|'desc'} order
     * @returns {Array} 新数组，不修改入参
     */
    function sortQuotesByPrice(quotes, order) {
        if (order !== 'asc' && order !== 'desc') return quotes;
        const dir = order === 'asc' ? 1 : -1;
        return [...quotes].sort((a, b) => {
            // 估算价永远在尾部
            if (a.isEstimate && !b.isEstimate) return 1;
            if (!a.isEstimate && b.isEstimate) return -1;
            // 同为精确价或同为估算价，按价格比较
            return (a.price - b.price) * dir;
        });
    }

    /**
     * 按来源筛选：只保留在 enabledSources 集合里的报价。
     * 传入 null/undefined/空集合表示"全部显示"。
     * @param {Array<Object>} quotes
     * @param {Set<string>|null} enabledSources
     */
    function filterBySources(quotes, enabledSources) {
        if (!enabledSources || enabledSources.size === 0) return quotes;
        return quotes.filter(q => enabledSources.has(q.source));
    }

    /**
     * 从一组报价里提取出现过的所有 source 名（去重、保序）。
     */
    function uniqueSources(quotes) {
        const seen = new Set();
        const out = [];
        for (const q of quotes) {
            if (!seen.has(q.source)) {
                seen.add(q.source);
                out.push(q.source);
            }
        }
        return out;
    }

    /**
     * 把 query 做基本清洗：去前后空格、合并中间多余空格。
     */
    function normalizeQuery(query) {
        if (typeof query !== 'string') return '';
        return query.trim().replace(/\s+/g, ' ');
    }

    /**
     * 简单的 HTML 转义，防止酒店名带 < > 把页面搞坏。
     * 别把用户输入直接 innerHTML 进去，必须走这一层。
     */
    function escapeHtml(str) {
        if (typeof str !== 'string') return '';
        return str
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    // 暴露到全局
    global.PricerUtils = {
        formatPrice,
        findLowestIndex,
        groupByRoomType,
        sortQuotesByPrice,
        filterBySources,
        uniqueSources,
        normalizeQuery,
        escapeHtml,
    };
})(window);