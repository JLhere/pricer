// api.js — 数据获取层
// 术语速讲：**数据层（data layer）**：负责跟外部数据源（OTA API / mock / 缓存）打交道。
// UI（app.js）不直接问 OTA 拿数据，只调 api.js.searchHotels(...)。换数据源只改这一层。

(function (global) {
    'use strict';

    // ====== Mock 数据 ======
    // ⚠️ 这些价格是假的，等接入 Booking 后会替换成真实数据。
    // 故意挑明显不真实的数字（¥888 / ¥666 / ¥520），方便一眼看出"这是示例"。
    // price 是"每晚基准价"——最终展示价会按日期/人数/晚数动态算出来。
    const POPULAR_HOTELS = [
        'Hilton Tokyo',
        '上海外滩茂悦大酒店',
        'Park Hyatt Tokyo',
        '上海外滩 W 酒店',
    ];

    const MOCK_DB = {
        'hilton tokyo': [
            {
                roomType: 'King Guest Room',
                quotes: [
                    { source: 'Booking.com', sourceIcon: '🅱',  price: 2854, currency: 'CNY', url: 'https://www.booking.com/' },
                    { source: 'Agoda',        sourceIcon: '🅰',  price: 2920, currency: 'CNY', url: 'https://www.agoda.com/' },
                    { source: 'Expedia',      sourceIcon: '🅴',  price: 2788, currency: 'CNY', url: 'https://www.expedia.com/' },
                    { source: '酒店官网',     sourceIcon: '🏨',  price: 666, currency: 'CNY', isEstimate: true, url: 'https://www.hiltontokyo.example/' },
                ],
            },
            {
                roomType: 'Twin Guest Room',
                quotes: [
                    { source: 'Booking.com', sourceIcon: '🅱',  price: 2654, currency: 'CNY', url: 'https://www.booking.com/' },
                    { source: 'Agoda',        sourceIcon: '🅰',  price: 2680, currency: 'CNY', url: 'https://www.agoda.com/' },
                    { source: 'Expedia',      sourceIcon: '🅴',  price: 2720, currency: 'CNY', url: 'https://www.expedia.com/' },
                ],
            },
        ],
        '上海外滩茂悦大酒店': [
            {
                roomType: '豪华江景房',
                quotes: [
                    { source: '携程',         sourceIcon: '✈',  price: 1888, currency: 'CNY', url: 'https://www.trip.com/' },
                    { source: '美团',         sourceIcon: '🐴', price: 1920, currency: 'CNY', url: 'https://www.meituan.com/' },
                    { source: 'Booking.com',  sourceIcon: '🅱',  price: 1756, currency: 'CNY', url: 'https://www.booking.com/' },
                    { source: '酒店官网',     sourceIcon: '🏨',  price: 1680, currency: 'CNY', url: 'https://www.hyatt.com/' },
                ],
            },
            {
                roomType: '豪华城景房',
                quotes: [
                    { source: '携程',         sourceIcon: '✈',  price: 1588, currency: 'CNY', url: 'https://www.trip.com/' },
                    { source: '美团',         sourceIcon: '🐴', price: 1620, currency: 'CNY', url: 'https://www.meituan.com/' },
                    { source: 'Booking.com',  sourceIcon: '🅱',  price: 1556, currency: 'CNY', url: 'https://www.booking.com/' },
                ],
            },
        ],
        'park hyatt tokyo': [
            {
                roomType: 'Park Twin Room',
                quotes: [
                    { source: 'Booking.com', sourceIcon: '🅱',  price: 4254, currency: 'CNY', url: 'https://www.booking.com/' },
                    { source: 'Agoda',        sourceIcon: '🅰',  price: 4320, currency: 'CNY', url: 'https://www.agoda.com/' },
                    { source: 'Expedia',      sourceIcon: '🅴',  price: 4188, currency: 'CNY', url: 'https://www.expedia.com/' },
                ],
            },
        ],
    };

    // ====== Mock 价格计算（让 mock 数据看起来"会动"）======
    // 真实接 Booking 后这部分会删掉。
    function getDateMultiplier(dateStr) {
        if (!dateStr) return 1.0;
        const d = new Date(dateStr);
        if (isNaN(d.getTime())) return 1.0;
        const day = d.getDay();         // 0=Sun, 5=Fri, 6=Sat
        if (day === 5 || day === 6) return 1.20;   // 周末 +20%
        if (day === 0) return 1.10;               // 周日 +10%
        return 0.90;                              // 工作日 -10%
    }
    function getPeopleMultiplier(adults) {
        // 2 人基准，每多一人 +15%（占房费比例）
        const a = Number(adults) || 2;
        if (a <= 2) return 1.0;
        return 1.0 + (a - 2) * 0.15;
    }
    /**
     * 儿童按年龄分档加价（每晚）：0-2 免费 / 3-12 +100 / 13-17 +200。
     * 真实场景跟 Booking 一致——不同年龄段儿童价格差异巨大。
     */
    function getChildrenExtraPerNight(childrenAges) {
        let extra = 0;
        for (const age of (childrenAges || [])) {
            const a = Number(age);
            if (isNaN(a)) continue;
            if (a >= 13) extra += 200;
            else if (a >= 3) extra += 100;
            // 0-2 免费
        }
        return extra;
    }
    function computeNights(checkin, checkout) {
        if (!checkin || !checkout) return 1;
        const a = new Date(checkin);
        const b = new Date(checkout);
        const diff = Math.round((b - a) / (1000 * 60 * 60 * 24));
        return Math.max(1, diff);
    }

    /**
     * 模拟网络延迟，方便看 loading 态。
     */
    function delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * 主入口：搜索酒店，返回报价（已按日期/人数/儿童/晚数计算总价）。
     * 房间数固定 1（不暴露给用户）—— 用户不知道房型能住几人，
     * 后期应当根据入住人数 + 房型容量自动匹配最优方案。
     *
     * @param {string} query - 酒店名
     * @param {Object} [options]
     * @param {string} [options.checkin]        - YYYY-MM-DD
     * @param {string} [options.checkout]       - YYYY-MM-DD
     * @param {number} [options.adults=2]
     * @param {number[]} [options.childrenAges=[]]
     * @returns {Promise<SearchResult>}
     */
    async function searchHotels(query, options = {}) {
        const normalized = query.trim().toLowerCase();
        await delay(600);

        const groups = MOCK_DB[normalized] || [];

        const checkin = options.checkin || '';
        const checkout = options.checkout || '';
        const adults = Number(options.adults) || 2;
        const childrenAges = Array.isArray(options.childrenAges) ? options.childrenAges : [];
        const nights = computeNights(checkin, checkout);

        const dateMult = getDateMultiplier(checkin);
        const peopleMult = getPeopleMultiplier(adults);
        const childrenExtraPerNight = getChildrenExtraPerNight(childrenAges);

        const processedGroups = groups.map(g => ({
            roomType: g.roomType,
            quotes: g.quotes.map(q => {
                const perNight = Math.round(q.price * dateMult * peopleMult + childrenExtraPerNight);
                const total = perNight * nights;
                return {
                    ...q,
                    pricePerNight: perNight,
                    totalPrice: total,
                };
            }),
        }));

        return {
            hotelName: query,
            isMock: true,
            found: processedGroups.length > 0,
            checkin, checkout,
            adults, childrenAges, nights,
            groups: processedGroups,
        };
    }

    /**
     * 返回热门酒店推荐（用于空态展示）。
     */
    function getPopularHotels() {
        return POPULAR_HOTELS.slice();
    }

    global.PricerApi = {
        searchHotels,
        getPopularHotels,
    };
})(window);