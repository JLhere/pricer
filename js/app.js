// app.js — 主入口 / controller
// 术语速讲：**controller / 协调者**：把 UI（DOM）和数据层（api.js）粘起来。
// 它做的事：监听用户操作 → 调 api.js → 把结果画到页面上。
// 它**不**直接处理数据格式化（那是 utils.js 的事），**不**直接拿数据（那是 api.js 的事）。
// 边界清楚，每层独立可换。

(function () {
    'use strict';

    const {
        formatPrice,
        findLowestIndex,
        sortQuotesByPrice,
        filterBySources,
        uniqueSources,
        normalizeQuery,
        escapeHtml,
    } = window.PricerUtils;
    const { searchHotels, getPopularHotels } = window.PricerApi;

    // 缓存 DOM 引用 — 别每次 querySelector，缓存起来更稳更快。
    const $ = (id) => document.getElementById(id);

    const els = {
        form: $('search-form'),
        searchSection: $('search-section'),
        searchSummary: $('search-summary'),
        summaryHotel: $('summary-hotel'),
        summaryDates: $('summary-dates'),
        summaryPeople: $('summary-people'),
        modifyBtn: $('modify-btn'),
        input: $('hotel-input'),
        checkin: $('checkin-input'),
        checkout: $('checkout-input'),
        adults: $('adults-select'),
        childrenSelect: $('children-select'),
        childrenAges: $('children-ages'),
        btn: $('search-btn'),
        loading: $('loading'),
        results: $('results'),
        resultsTitle: $('results-title'),
        resultsSubtitle: $('results-subtitle'),
        resultsCount: $('results-count'),
        watermark: $('results-watermark'),
        sortControl: $('sort-control'),
        sourceToggles: $('source-toggles'),
        resultsList: $('results-list'),
        empty: $('empty'),
        noResults: $('no-results'),
        noResultsTitle: $('no-results-title'),
        popularHotels: $('popular-hotels'),
        error: $('error'),
        errorMsg: $('error-msg'),
    };

    // ====== 默认日期：今天 / 明天 ======
    function todayISO(offsetDays = 0) {
        const d = new Date();
        d.setDate(d.getDate() + offsetDays);
        return d.toISOString().slice(0, 10);
    }

    // ====== 应用状态 ======
    const state = {
        currentData: null,
        currentSort: 'default',
        currentSources: null,
    };

    // ====== 状态切换 ======
    function showState(name) {
        for (const key of ['loading', 'results', 'empty', 'noResults', 'error']) {
            els[key].classList.toggle('hidden', key !== name);
        }
        // 搜索栏 vs 搜索摘要：结果状态时折叠搜索栏、显示摘要；其他状态反过来
        const showSummary = (name === 'results');
        els.searchSection.classList.toggle('collapsed', showSummary);
        els.searchSummary.classList.toggle('hidden', !showSummary);
    }

    // ====== 渲染搜索摘要（结果状态时调用）======
    function renderSearchSummary(data) {
        const hotelName = data.hotelName || '—';
        const dates = data.checkin && data.checkout
            ? `${formatShortDate(data.checkin)} - ${formatShortDate(data.checkout)} · ${data.nights}晚`
            : '—';
        const childCount = (data.childrenAges || []).length;
        const people = `${data.adults}成人${childCount ? ` · ${childCount}儿童` : ''}`;

        els.summaryHotel.textContent = `「${hotelName}」`;
        els.summaryDates.textContent = dates;
        els.summaryPeople.textContent = people;
    }

    // ====== 搜索条件格式化 ======
    function formatShortDate(iso) {
        if (!iso) return '';
        const d = new Date(iso);
        if (isNaN(d.getTime())) return iso;
        return `${d.getMonth() + 1}/${d.getDate()}`;
    }
    function formatCriteria(data) {
        if (!data.checkin) return '';
        const dateRange = `${formatShortDate(data.checkin)} - ${formatShortDate(data.checkout)} · ${data.nights}晚`;
        const childCount = (data.childrenAges || []).length;
        const people = `${data.adults}成人${childCount ? ` · ${childCount}儿童` : ''}`;
        return `${dateRange} · ${people}`;
    }

    // ====== 渲染结果 ======
    function renderResults(data) {
        const { hotelName, isMock, groups } = data;

        // 标题 + 搜索条件
        els.resultsTitle.textContent = `「${hotelName}」的比价结果`;
        const subtitle = formatCriteria(data);
        els.resultsSubtitle.textContent = subtitle;
        els.resultsSubtitle.classList.toggle('hidden', !subtitle);

        // 水印
        els.watermark.textContent = isMock ? '示例数据' : '实时数据';
        els.watermark.style.background = isMock ? '' : '#dcfce7';
        els.watermark.style.color = isMock ? '' : '#166534';

        // 来源筛选按钮
        renderSourceToggles(uniqueSources(groups.flatMap(g => g.quotes)));

        // 处理每个房型：先按来源筛选 → 再按价格排序
        // 排序键改为 totalPrice（"总价最便宜"才是用户想要的"最低价"）
        const processedGroups = groups.map(g => {
            const filtered = filterBySources(g.quotes, state.currentSources);
            const sorted = sortQuotesByTotalPrice(filtered, state.currentSort);
            return { roomType: g.roomType, quotes: sorted };
        });

        // 计数
        const visibleQuotes = processedGroups.reduce((n, g) => n + g.quotes.length, 0);
        const totalQuotes = groups.reduce((n, g) => n + g.quotes.length, 0);
        const hiddenNote = (visibleQuotes < totalQuotes) ? `（已隐藏 ${totalQuotes - visibleQuotes} 条）` : '';
        els.resultsCount.textContent = `${groups.length} 个房型 · ${visibleQuotes} 条报价${hiddenNote}`;

        // 边界：全部隐藏
        if (processedGroups.every(g => g.quotes.length === 0)) {
            els.resultsList.innerHTML = `
                <div class="empty-state">
                    <p>已隐藏所有来源</p>
                    <button type="button" class="link-btn" id="reset-sources">恢复全部来源</button>
                </div>
            `;
            const resetBtn = $('reset-sources');
            if (resetBtn) {
                resetBtn.addEventListener('click', () => {
                    state.currentSources = null;
                    renderSourceToggles(uniqueSources(groups.flatMap(g => g.quotes)));
                    renderResults(data);
                });
            }
            return;
        }

        // 正常渲染
        els.resultsList.innerHTML = processedGroups
            .filter(g => g.quotes.length > 0)
            .map(renderGroup)
            .join('');
    }

    // 按总价排序（utils 里是按 price 排序，这里用 totalPrice）
    function sortQuotesByTotalPrice(quotes, order) {
        if (order !== 'asc' && order !== 'desc') return quotes;
        const dir = order === 'asc' ? 1 : -1;
        return [...quotes].sort((a, b) => {
            if (a.isEstimate && !b.isEstimate) return 1;
            if (!a.isEstimate && b.isEstimate) return -1;
            return (a.totalPrice - b.totalPrice) * dir;
        });
    }

    function renderGroup(group) {
        // 最低价基于**当前筛选后**的 totalPrice
        let lowestIdx = -1;
        let lowestVal = Infinity;
        group.quotes.forEach((q, i) => {
            if (q.isEstimate) return;
            if (typeof q.totalPrice !== 'number') return;
            if (q.totalPrice < lowestVal) { lowestVal = q.totalPrice; lowestIdx = i; }
        });
        const items = group.quotes.map((q, i) => renderQuote(q, i === lowestIdx)).join('');
        return `
            <div class="room-group">
                <div class="room-group-title">${escapeHtml(group.roomType)}</div>
                <div class="result-list">${items}</div>
            </div>
        `;
    }

    function renderQuote(quote, isLowest) {
        const totalText = formatPrice(quote.totalPrice, quote.currency);
        const perNightText = formatPrice(quote.pricePerNight, quote.currency);
        const lowestBadge = isLowest ? '<span class="lowest-badge">最低价</span>' : '';
        const estimateTag = quote.isEstimate ? '<span class="result-price-estimate">估算</span>' : '';
        const href = quote.url || '#';
        const target = href === '#' ? '' : 'target="_blank" rel="noopener"';

        return `
            <a class="result-card ${isLowest ? 'is-lowest' : ''}" href="${escapeHtml(href)}" ${target} role="listitem">
                <div class="result-source">
                    <div class="source-icon" aria-hidden="true">${escapeHtml(quote.sourceIcon || '·')}</div>
                    <div class="source-info">
                        <div class="source-name">${escapeHtml(quote.source)}</div>
                    </div>
                </div>
                <div class="result-price-wrap">
                    <div class="result-price-main">
                        <span class="result-price">${totalText}${lowestBadge}</span>
                        <span class="result-price-meta">${perNightText} /晚</span>
                    </div>
                    ${estimateTag}
                    <span class="result-arrow">→</span>
                </div>
            </a>
        `;
    }

    // ====== 来源筛选按钮渲染 ======
    function renderSourceToggles(sources) {
        els.sourceToggles.innerHTML = sources.map(s => {
            const isActive = state.currentSources === null || state.currentSources.has(s);
            return `<button type="button" class="source-toggle ${isActive ? 'active' : ''}" data-source="${escapeHtml(s)}">${escapeHtml(s)}</button>`;
        }).join('');
    }

    // ====== 热门酒店 ======
    function renderPopularHotels() {
        const list = getPopularHotels();
        els.popularHotels.innerHTML = list.map(name => {
            return `<button type="button" class="popular-chip" data-hotel="${escapeHtml(name)}">${escapeHtml(name)}</button>`;
        }).join('');
    }

    // ====== 错误渲染 ======
    function renderError(msg) {
        els.errorMsg.textContent = msg;
        showState('error');
    }

    // ====== 事件处理 ======
    function handleSortClick(e) {
        const btn = e.target.closest('.seg-btn');
        if (!btn) return;
        const order = btn.dataset.order;
        if (!order || order === state.currentSort) return;
        state.currentSort = order;
        els.sortControl.querySelectorAll('.seg-btn').forEach(b => {
            b.classList.toggle('active', b.dataset.order === order);
        });
        if (state.currentData) renderResults(state.currentData);
    }

    function handleSourceToggle(e) {
        const btn = e.target.closest('.source-toggle');
        if (!btn) return;
        const source = btn.dataset.source;
        if (!source || !state.currentData) return;
        const allSources = uniqueSources(state.currentData.groups.flatMap(g => g.quotes));
        if (state.currentSources === null) {
            state.currentSources = new Set(allSources);
        }
        if (state.currentSources.has(source)) {
            state.currentSources.delete(source);
        } else {
            state.currentSources.add(source);
        }
        renderResults(state.currentData);
    }

    function handlePopularClick(e) {
        const btn = e.target.closest('.popular-chip');
        if (!btn) return;
        const name = btn.dataset.hotel;
        if (!name) return;
        els.input.value = name;
        els.form.dispatchEvent(new Event('submit'));
    }

    // ====== "修改"按钮：展开搜索栏，让用户改条件 ======
    function handleModifyClick() {
        // 展开搜索栏
        els.searchSection.classList.remove('collapsed');
        els.searchSummary.classList.add('hidden');
        // 焦点放回酒店名输入框，方便直接改
        els.input.focus();
        els.input.select();
    }

    // ====== 儿童年龄（动态渲染，嵌在儿童字段内）======
    function renderChildrenAges(n) {
        const container = els.childrenAges;
        container.innerHTML = '';
        if (n <= 0) {
            container.classList.add('hidden');
            return;
        }
        container.classList.remove('hidden');

        for (let i = 0; i < n; i++) {
            const fieldWrap = document.createElement('div');
            fieldWrap.className = 'search-field';
            // 第一个是占位符（不可选），用户必须明确选一个
            const options = [`<option value="" disabled selected>-- 请选择 --</option>`];
            for (let age = 0; age <= 17; age++) {
                options.push(`<option value="${age}">${age} 岁</option>`);
            }
            fieldWrap.innerHTML = `
                <label class="search-label">儿童 ${i + 1}</label>
                <select class="search-input search-input-sm child-age-select" required>${options.join('')}</select>
            `;
            container.appendChild(fieldWrap);
        }
    }

    // ====== 搜索处理 ======
    function readForm() {
        const childAgeEls = els.childrenAges.querySelectorAll('.child-age-select');
        const childrenAges = Array.from(childAgeEls).map(s => Number(s.value));
        return {
            query: normalizeQuery(els.input.value),
            checkin: els.checkin.value,
            checkout: els.checkout.value,
            adults: Number(els.adults.value) || 2,
            childrenAges,
        };
    }

    function validateForm(form) {
        if (!form.query) {
            els.input.focus();
            return false;
        }
        if (!form.checkin || !form.checkout) {
            alert('请选择入离店日期');
            return false;
        }
        if (new Date(form.checkout) <= new Date(form.checkin)) {
            alert('离店日期需要晚于入住日期');
            return false;
        }
        // 校验所有儿童年龄都已填写
        const ageSelects = els.childrenAges.querySelectorAll('.child-age-select');
        for (let i = 0; i < ageSelects.length; i++) {
            if (ageSelects[i].value === '') {
                ageSelects[i].focus();
                alert(`请填写「儿童 ${i + 1}」的年龄`);
                return false;
            }
        }
        return true;
    }

    async function handleSearch(e) {
        if (e) e.preventDefault();
        const form = readForm();
        if (!validateForm(form)) return;

        els.btn.disabled = true;
        els.btn.querySelector('.btn-label').textContent = '搜索中…';
        showState('loading');

        try {
            const data = await searchHotels(form.query, {
                checkin: form.checkin,
                checkout: form.checkout,
                adults: form.adults,
                childrenAges: form.childrenAges,
            });
            state.currentData = data;
            state.currentSort = 'default';
            state.currentSources = null;
            els.sortControl.querySelectorAll('.seg-btn').forEach(b => {
                b.classList.toggle('active', b.dataset.order === 'default');
            });

            if (!data.found) {
                els.noResultsTitle.textContent = `没找到「${escapeHtml(form.query)}」的报价`;
                renderPopularHotels();
                showState('noResults');
            } else {
                renderResults(data);
                renderSearchSummary(data);
                showState('results');
            }
        } catch (err) {
            console.error('[Pricer] search failed:', err);
            renderError('拉取报价失败，请稍后再试');
        } finally {
            els.btn.disabled = false;
            els.btn.querySelector('.btn-label').textContent = 'Search';
        }
    }

    // ====== 启动 ======
    document.addEventListener('DOMContentLoaded', () => {
        // 默认日期
        els.checkin.value = todayISO(0);
        els.checkout.value = todayISO(1);
        els.checkin.min = todayISO(0);
        els.checkout.min = todayISO(1);

        // 当 checkin 变化时，自动把 checkout 调到至少 +1 天
        els.checkin.addEventListener('change', () => {
            const minCheckout = todayISO(1);
            const nextDay = new Date(els.checkin.value);
            nextDay.setDate(nextDay.getDate() + 1);
            const suggested = nextDay.toISOString().slice(0, 10);
            els.checkout.min = suggested;
            if (!els.checkout.value || els.checkout.value < suggested) {
                els.checkout.value = suggested;
            }
        });

        els.form.addEventListener('submit', handleSearch);
        els.sortControl.addEventListener('click', handleSortClick);
        els.sourceToggles.addEventListener('click', handleSourceToggle);
        els.popularHotels.addEventListener('click', handlePopularClick);
        els.modifyBtn.addEventListener('click', handleModifyClick);

        // 日期触发区：点击整个区域都弹日历（兼容 Safari 等只响应图标的浏览器）
        // 注意：Safari 桌面版点 input 文本区域浏览器自己不弹日历，所以这里**不**做去重，
        // 一律主动 showPicker()。Chrome 等浏览器自己会弹日历，但 JS showPicker 不会双重（浏览器内部去重）。
        function openDatePicker(input) {
            if (!input) return;
            input.focus();
            try {
                if (typeof input.showPicker === 'function') {
                    input.showPicker();
                    return;
                }
            } catch {}
            input.click();   // 兜底：老浏览器依赖浏览器自己处理
        }

        document.querySelectorAll('.date-trigger').forEach(trigger => {
            trigger.addEventListener('click', (e) => {
                // input 自身点击也接管（Safari 桌面版点 input 文本区域需要 JS 触发）
                const input = document.getElementById(trigger.dataset.target);
                openDatePicker(input);
            });
        });

        // input 自己也监听一遍（防止 click 事件被浏览器吞掉的情况）
        [els.checkin, els.checkout].forEach(input => {
            input.addEventListener('click', () => openDatePicker(input));
        });

        // 儿童人数 → 动态生成年龄字段
        els.childrenSelect.addEventListener('change', () => {
            renderChildrenAges(Number(els.childrenSelect.value) || 0);
        });

        showState('empty');
    });
})();