// Settings page: add, edit, test and pick global model profiles. The API never
// returns keys, so the key field is always blank and "leave empty" means "keep
// it". The lab, page assistant and interview read the same catalog.
import { button, el } from '../dom';
import { labApi } from '../lab/api';
import {
  applyPriceMatch,
  copyForm,
  formFromProfile,
  groupPriceMatches,
  markManualPrice,
  priceChoiceLabel,
  priceChoiceMatch,
  needsKey,
  priceLine,
  priceSummary,
  profilePayload,
  reasoningLabel,
  reuseKeyId,
  validateProfileForm,
  type ModelCatalog,
  type ModelProfile,
  type PriceLookup,
  type ProbeResult,
  type ProfileForm,
} from './model-profiles';
import { invalidateProfiles } from '../lab/ui';

let uid = 0;

function field(label: string, control: HTMLElement, help?: string, wide = false) {
  const wrap = el('label', wide ? 'lab-field lab-field--wide' : 'lab-field', el('span', 'lab-field-label', label), control);
  if (help) wrap.append(el('span', 'lab-field-help', help));
  return wrap;
}

/** Composite controls (input + buttons + popup) cannot live inside a <label>:
 *  the label would swallow button clicks and re-focus the input. Link a
 *  separate <label for> instead. */
function fieldFor(label: string, control: HTMLElement, forId: string, help?: string) {
  const text = el('label', 'lab-field-label', label);
  text.htmlFor = forId;
  const wrap = el('div', 'lab-field', text, control);
  if (help) wrap.append(el('span', 'lab-field-help', help));
  return wrap;
}

function textInput(placeholder = ''): HTMLInputElement {
  const input = el('input', 'lab-input');
  input.placeholder = placeholder;
  return input;
}

function probeText(result: ProbeResult): string {
  if (!result.ok) return `连接失败：${result.error ?? '未知原因'}`;
  const count = result.models.length;
  return `连接成功（${result.latency_ms} ms，${count} 个可用模型）`;
}

export function mountModelSettings(host: HTMLElement) {
  host.replaceChildren();
  const intro = el(
    'p',
    'lab-muted',
    '每个档案是一套模型接口：地址、密钥、模型 ID、推理参数和单价。选一个档案设为默认后，提问和命令行评估都会用它；' +
      '密钥只保存在这台机器上，不回显、不写进轨迹。',
  );
  const notice = el('p', 'lab-model-status');
  notice.hidden = true;
  const showNotice = (message: string, ok?: boolean) => {
    notice.hidden = false;
    notice.textContent = message;
    if (ok === undefined) delete notice.dataset.ok;
    else notice.dataset.ok = String(ok);
  };
  const warnings = el('div');
  const list = el('div', 'lab-model-list');
  const formHost = el('div');
  const syncAllButton = button('同步全部价格', 'lab-btn', () => void syncAll());
  const addButton = button('添加模型', 'lab-btn lab-btn--primary', () => openForm());
  host.append(
    el('div', 'lab-model-head', el('h2', 'lab-h2', '模型档案'), el('div', 'lab-model-head-actions', syncAllButton, addButton)),
    intro,
    notice,
    warnings,
    list,
    formHost,
  );

  let catalog: ModelCatalog | undefined;
  let editing: ModelProfile | undefined;

  async function load() {
    try {
      catalog = await labApi<ModelCatalog>('/models');
      warnings.replaceChildren(...(catalog.warnings ?? []).map((text) => el('p', 'lab-notice lab-notice--warn', text)));
      renderList();
    } catch (error) {
      list.replaceChildren(el('p', 'lab-notice lab-notice--error', error instanceof Error ? error.message : String(error)));
    }
  }

  function renderList() {
    const profiles = catalog?.profiles ?? [];
    if (!profiles.length) {
      list.replaceChildren(el('p', 'lab-model-empty', '还没有模型档案，点右上角「添加模型」。不添加时继续使用 .env 里的默认模型。'));
      return;
    }
    list.replaceChildren(...profiles.map(card));
  }

  function card(profile: ModelProfile) {
    const isDefault = catalog?.default === profile.id;
    const head = el(
      'div',
      'lab-model-card-head',
      el('span', 'lab-model-name', profile.name),
      isDefault ? el('span', 'lab-badge lab-badge--ok', '默认') : null,
      el('code', 'lab-model-id', profile.id),
    );
    const meta = el(
      'dl',
      'lab-model-meta',
      el('dt', '', '模型 ID'),
      el('dd', '', el('code', '', profile.model)),
      el('dt', '', 'API 地址'),
      el('dd', '', el('code', '', profile.base_url)),
      el('dt', '', '上下文 / 输出'),
      el('dd', '', `${profile.context_window.toLocaleString('en-US')} / ${profile.max_output_tokens.toLocaleString('en-US')} token`),
      el('dt', '', '价格'),
      el('dd', '', priceLine(profile)),
      el('dt', '', '推理'),
      el('dd', '', reasoningLabel(profile)),
      el('dt', '', '密钥'),
      el('dd', '', profile.has_key ? '已保存（不回显）' : '未设置'),
    );
    const status = el('p', 'lab-model-status');
    status.hidden = true;
    const choices = el('div', 'lab-price-candidates');
    const actions = el(
      'div',
      'lab-model-actions',
      button('编辑', 'lab-btn lab-btn--small', () => openForm(profile)),
      button('复制', 'lab-btn lab-btn--small', () => openForm(undefined, profile)),
      button('测试连接', 'lab-btn lab-btn--small', async () => {
        status.hidden = false;
        status.textContent = '正在请求 /models……';
        try {
          const result = await labApi<ProbeResult>(`/models/${profile.id}/test`, {});
          status.textContent = probeText(result);
          status.dataset.ok = String(result.ok);
        } catch (error) {
          status.textContent = error instanceof Error ? error.message : String(error);
          status.dataset.ok = 'false';
        }
      }),
      button('同步价格', 'lab-btn lab-btn--small', async () => {
        status.hidden = false;
        status.textContent = '正在同步 models.dev 价格……';
        try {
          const data = await labApi<{ profile: ModelProfile }>(`/models/${profile.id}/pricing/sync`, { force: true });
          await load();
          showNotice(`「${profile.name}」已同步：${priceLine(data.profile)}`, true);
        } catch (error) {
          status.dataset.ok = 'false';
          status.textContent = error instanceof Error ? error.message : String(error);
          void offerPriceChoices(profile, choices, status);
        }
      }),
      isDefault ? null : button('设为默认', 'lab-btn lab-btn--small', () => setDefault(profile.id)),
      button('删除', 'lab-btn lab-btn--small lab-btn--danger', () => remove(profile)),
    );
    const cardNode = el('article', 'lab-model-card', head, meta, actions, choices, status);
    return cardNode;
  }

  async function offerPriceChoices(profile: ModelProfile, host: HTMLElement, status: HTMLElement) {
    status.textContent = '目录里有多条同名价格，正在列出候选……';
    try {
      const data = await labApi<PriceLookup>('/pricing/lookup', {
        model: profile.model,
        base_url: profile.base_url,
        limit: 20,
      });
      const options = groupPriceMatches(data.matches);
      if (!options.length) {
        status.textContent = '目录里没有与这个模型相关的条目，请手填单价';
        return;
      }
      host.replaceChildren(
        ...options.map((choice) => {
          const match = priceChoiceMatch(choice);
          const option = button(`${priceChoiceLabel(choice)} · ${priceSummary(match)}`, 'lab-price-candidate', async () => {
            try {
              await labApi(`/models/${profile.id}/pricing/apply`, { key: choice.key });
              await load();
              showNotice(`「${profile.name}」已使用 ${choice.key} 的价格`, true);
            } catch (error) {
              status.dataset.ok = 'false';
              status.textContent = error instanceof Error ? error.message : String(error);
            }
          });
          option.append(el('span', 'lab-price-candidate-cost', match.name));
          return option;
        }),
      );
      status.textContent = '同一个模型有多档价格，点一条填入：';
      status.dataset.ok = 'true';
    } catch (error) {
      status.dataset.ok = 'false';
      status.textContent = error instanceof Error ? error.message : String(error);
    }
  }

  async function syncAll() {
    syncAllButton.disabled = true;
    showNotice('正在同步全部档案的 models.dev 价格……');
    try {
      const data = await labApi<{ updated: string[]; skipped: { id: string; reason: string }[] }>('/models/pricing/sync', {});
      const skipped = data.skipped.length
        ? `；跳过 ${data.skipped.length} 个：${data.skipped.map((item) => item.id).join('、')}`
        : '';
      showNotice(`已更新 ${data.updated.length} 个档案${skipped}`, data.updated.length > 0);
      await load();
    } catch (error) {
      showNotice(error instanceof Error ? error.message : String(error), false);
    } finally {
      syncAllButton.disabled = false;
    }
  }

  async function setDefault(id: string) {
    try {
      await labApi(`/models/${id}/default`, {});
      invalidateProfiles();
      await load();
    } catch (error) {
      window.alert(error instanceof Error ? error.message : String(error));
    }
  }

  async function remove(profile: ModelProfile) {
    if (!window.confirm(`删除模型档案「${profile.name}」？密钥会一起删除，历史运行不受影响。`)) return;
    try {
      await labApi(`/models/${profile.id}`, undefined, 'DELETE');
      invalidateProfiles();
      if (editing?.id === profile.id) closeForm();
      await load();
    } catch (error) {
      window.alert(error instanceof Error ? error.message : String(error));
    }
  }

  function closeForm() {
    editing = undefined;
    formHost.replaceChildren();
  }

  function openForm(profile?: ModelProfile, copyFrom?: ModelProfile) {
    editing = profile;
    const state: ProfileForm = copyFrom && !profile ? copyForm(copyFrom) : formFromProfile(profile);
    formHost.replaceChildren(buildForm(state, profile, copyFrom));
    formHost.scrollIntoView({ behavior: 'smooth', block: 'start' });
    if (copyFrom && !profile) formHost.querySelector('input')?.focus();
  }

  function buildForm(state: ProfileForm, profile?: ModelProfile, copyFrom?: ModelProfile) {
    const keySource = profile ?? copyFrom;
    const form = el('form', 'lab-model-form');
    const uidSuffix = ++uid;

    const name = textInput('例如 GLM-5.3-Flash');
    name.value = state.name;
    name.addEventListener('input', () => (state.name = name.value));

    const baseUrl = textInput('http://127.0.0.1:7864/v1');
    baseUrl.value = state.base_url;
    baseUrl.addEventListener('input', () => (state.base_url = baseUrl.value));

    const protocol = el('select', 'lab-input');
    protocol.append(new Option('OpenAI Chat Completions', 'openai-chat'));
    protocol.disabled = true;

    const apiKey = el('input', 'lab-input');
    apiKey.type = 'password';
    apiKey.autocomplete = 'new-password';
    apiKey.placeholder = keySource?.has_key ? (profile ? '已保存，留空则不修改' : '留空则沿用原档案密钥') : '没有鉴权可以留空';
    apiKey.value = state.api_key;
    apiKey.addEventListener('input', () => (state.api_key = apiKey.value));
    const reveal = el('input');
    reveal.type = 'checkbox';
    reveal.addEventListener('change', () => (apiKey.type = reveal.checked ? 'text' : 'password'));
    const keyRow = el('div', 'lab-model-key', apiKey, el('label', 'lab-check', reveal, el('span', '', '显示')));

    const model = textInput('例如 cn:glm-5.3-flash');
    model.id = `lab-model-id-${uidSuffix}`;
    model.value = state.model;
    model.setAttribute('role', 'combobox');
    model.setAttribute('aria-autocomplete', 'list');
    model.setAttribute('aria-expanded', 'false');

    // Native <datalist> popups are inconsistent across browsers and can be
    // swallowed by the surrounding <label>. Use an explicit dropdown so the
    // models returned by "获取可用模型" are always clickable.
    let availableModels: string[] = [];
    const pickerList = el('div', 'lab-model-combo-list');
    pickerList.id = `lab-model-options-${uidSuffix}`;
    pickerList.hidden = true;
    pickerList.setAttribute('role', 'listbox');
    pickerList.setAttribute('aria-label', '可用模型');
    model.setAttribute('aria-controls', pickerList.id);

    const pickerToggle = button('', 'lab-model-combo-toggle', () => void togglePicker());
    pickerToggle.title = '获取并选择可用模型';
    pickerToggle.setAttribute('aria-label', '选择可用模型');
    pickerToggle.setAttribute('aria-expanded', 'false');
    pickerToggle.innerHTML =
      '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"></path></svg>';

    const modelCombo = el('div', 'lab-model-combo', model, pickerToggle, pickerList);
    model.addEventListener('input', () => (state.model = model.value));
    model.addEventListener('keydown', (event) => {
      if (event.key === 'ArrowDown' && availableModels.length) {
        event.preventDefault();
        openPicker();
      } else if (event.key === 'Escape') {
        closePicker();
      }
    });

    function closePicker() {
      pickerList.hidden = true;
      model.setAttribute('aria-expanded', 'false');
      pickerToggle.setAttribute('aria-expanded', 'false');
      document.removeEventListener('pointerdown', onPickerOutside, true);
    }

    function onPickerOutside(event: Event) {
      if (event.target instanceof Node && !modelCombo.contains(event.target)) closePicker();
    }

    function openPicker() {
      if (!availableModels.length) return;
      pickerList.hidden = false;
      model.setAttribute('aria-expanded', 'true');
      pickerToggle.setAttribute('aria-expanded', 'true');
      document.removeEventListener('pointerdown', onPickerOutside, true);
      document.addEventListener('pointerdown', onPickerOutside, true);
    }

    function renderAvailableModels(models: string[]) {
      availableModels = [...models];
      pickerList.replaceChildren(
        ...models.map((id) => {
          const option = button(id, 'lab-model-combo-option', () => {
            model.value = id;
            state.model = id;
            closePicker();
            model.focus();
          });
          option.setAttribute('role', 'option');
          return option;
        }),
      );
    }

    function togglePicker() {
      if (!pickerList.hidden) closePicker();
      else if (availableModels.length) openPicker();
      else void discover();
    }

    const context = textInput('200K 或 1000000');
    context.value = state.context_window;
    context.addEventListener('input', () => (state.context_window = context.value));

    const output = el('input', 'lab-input');
    output.type = 'number';
    output.min = '1';
    output.value = state.max_output_tokens;
    output.addEventListener('input', () => (state.max_output_tokens = output.value));

    const inputTypes = el('div', 'lab-model-types');
    for (const [type, label] of [
      ['text', '文本'],
      ['image', '图片'],
    ] as const) {
      const box = el('input');
      box.type = 'checkbox';
      box.checked = state.input_types.includes(type);
      box.addEventListener('change', () => {
        state.input_types = box.checked
          ? [...state.input_types.filter((item) => item !== type), type]
          : state.input_types.filter((item) => item !== type);
      });
      inputTypes.append(el('label', 'lab-check', box, el('span', '', label)));
    }
    inputTypes.append(el('span', 'lab-field-help', '随页问答会按这里的勾选发送视口截图；其他运行仍只发文本。'));

    const reasoningEnabled = el('input');
    reasoningEnabled.type = 'checkbox';
    reasoningEnabled.checked = state.reasoning_enabled;
    const parameter = textInput('reasoning_effort');
    parameter.value = state.reasoning_parameter;
    parameter.addEventListener('input', () => (state.reasoning_parameter = parameter.value));

    const defaultSelect = el('select', 'lab-input');
    defaultSelect.addEventListener('change', () => (state.reasoning_default = defaultSelect.value));
    const levelsBox = el('div', 'lab-model-levels');
    const refreshDefaults = () => {
      const current = state.reasoning_default;
      defaultSelect.replaceChildren(new Option('不发送（默认）', ''), ...state.reasoning_levels.map((level) => new Option(level.name || '（未命名）', level.name)));
      if ([...defaultSelect.options].some((option) => option.value === current)) defaultSelect.value = current;
      else defaultSelect.value = '';
    };
    const renderLevels = () => {
      levelsBox.replaceChildren(
        ...state.reasoning_levels.map((level, index) => {
          const levelName = textInput('档位名');
          levelName.value = level.name;
          levelName.addEventListener('input', () => {
            const previous = state.reasoning_levels[index].name;
            level.name = levelName.value;
            if (state.reasoning_default === previous) state.reasoning_default = level.name;
            refreshDefaults();
          });
          const levelValue = textInput('API 参数值，例如 low');
          levelValue.value = level.value;
          levelValue.addEventListener('input', () => (level.value = levelValue.value));
          return el(
            'div',
            'lab-model-level',
            levelName,
            el('span', 'lab-model-level-arrow', '→'),
            levelValue,
            button('删除', 'lab-btn lab-btn--small lab-btn--danger', () => {
              if (state.reasoning_levels.length <= 1) return;
              state.reasoning_levels = state.reasoning_levels.filter((item) => item !== level);
              if (!state.reasoning_levels.some((item) => item.name === state.reasoning_default)) state.reasoning_default = '';
              renderLevels();
              refreshDefaults();
            }),
          );
        }),
      );
    };
    renderLevels();
    refreshDefaults();
    const addLevel = button('添加档位', 'lab-btn lab-btn--small', () => {
      state.reasoning_levels = [...state.reasoning_levels, { name: `level${state.reasoning_levels.length + 1}`, value: '' }];
      renderLevels();
      refreshDefaults();
    });
    const reasoningBox = el(
      'div',
      'lab-model-reasoning',
      el('div', 'lab-model-grid', field('参数名', parameter, '多数接口用 reasoning_effort'), field('默认档位', defaultSelect, '请求时按这一档注入；「不发送」表示不加参数')),
      el('div', 'lab-model-level-head', el('span', '', '档位'), el('span', ''), el('span', '', 'API 参数值（留空 = 不发送）')),
      levelsBox,
      addLevel,
    );
    reasoningBox.hidden = !state.reasoning_enabled;
    reasoningEnabled.addEventListener('change', () => {
      state.reasoning_enabled = reasoningEnabled.checked;
      reasoningBox.hidden = !state.reasoning_enabled;
    });

    const status = el('p', 'lab-model-status');
    status.hidden = true;
    const showStatus = (message: string, ok?: boolean) => {
      status.hidden = false;
      status.textContent = message;
      if (ok === undefined) delete status.dataset.ok;
      else status.dataset.ok = String(ok);
    };

    const probe = async (): Promise<ProbeResult | null> => {
      if (!state.base_url.trim()) {
        showStatus('先填写 API 地址', false);
        return null;
      }
      showStatus('正在请求 /models……');
      try {
        const result = await labApi<ProbeResult>('/models/test', {
          base_url: state.base_url.trim(),
          api_key: state.api_key.trim() || undefined,
          id: reuseKeyId(keySource, state),
        });
        if (result.ok) renderAvailableModels(result.models);
        showStatus(probeText(result), result.ok);
        return result;
      } catch (error) {
        showStatus(error instanceof Error ? error.message : String(error), false);
        return null;
      }
    };

    async function discover() {
      const result = await probe();
      if (!result?.ok) return;
      const count = result.models.length;
      showStatus(count ? `已获取 ${count} 个模型，点右侧箭头选择` : '接口没有返回可用模型，请手填模型 ID', count > 0);
      if (count) openPicker();
    }

    const testButton = button('测试连接', 'lab-btn lab-btn--small', () => void probe());
    const discoverButton = button('获取可用模型', 'lab-btn lab-btn--small', () => void discover());

    // Editing any price by hand turns the profile into a manual price, so a later
    // "sync all" will not overwrite what the user typed.
    const priceInput = textInput('0.15');
    priceInput.value = state.price_input;
    priceInput.inputMode = 'decimal';
    priceInput.addEventListener('input', () => Object.assign(state, markManualPrice({ ...state, price_input: priceInput.value })));
    const priceOutput = textInput('0.6');
    priceOutput.value = state.price_output;
    priceOutput.inputMode = 'decimal';
    priceOutput.addEventListener('input', () => Object.assign(state, markManualPrice({ ...state, price_output: priceOutput.value })));
    const priceCacheRead = textInput('0.003');
    priceCacheRead.value = state.price_cache_read;
    priceCacheRead.inputMode = 'decimal';
    priceCacheRead.addEventListener('input', () =>
      Object.assign(state, markManualPrice({ ...state, price_cache_read: priceCacheRead.value })),
    );
    const priceCacheWrite = textInput('0');
    priceCacheWrite.value = state.price_cache_write;
    priceCacheWrite.inputMode = 'decimal';
    priceCacheWrite.addEventListener('input', () =>
      Object.assign(state, markManualPrice({ ...state, price_cache_write: priceCacheWrite.value })),
    );

    const candidates = el('div', 'lab-price-candidates');
    const lookupButton = button('查找价格', 'lab-btn lab-btn--small', () => void lookup());

    const renderCandidates = (data: PriceLookup) => {
      candidates.replaceChildren(
        ...groupPriceMatches(data.matches).map((choice) => {
          const match = priceChoiceMatch(choice);
          const option = button(`${priceChoiceLabel(choice)} · ${match.name}`, 'lab-price-candidate', () => {
            Object.assign(state, applyPriceMatch(state, match));
            priceInput.value = state.price_input;
            priceOutput.value = state.price_output;
            priceCacheRead.value = state.price_cache_read;
            priceCacheWrite.value = state.price_cache_write;
            showStatus(`已填入 ${match.key} 的价格，保存后生效`, true);
          });
          option.append(el('span', 'lab-price-candidate-cost', priceSummary(match)));
          return option;
        }),
      );
    };

    async function lookup() {
      if (!state.model.trim()) {
        showStatus('先在「模型 ID」里填模型名', false);
        return;
      }
      lookupButton.disabled = true;
      showStatus('正在查找 models.dev 价格……');
      try {
        const data = await labApi<PriceLookup>('/pricing/lookup', {
          model: state.model.trim(),
          base_url: state.base_url.trim() || undefined,
        });
        renderCandidates(data);
        const cache = data.catalog.stale ? `（使用 ${data.catalog.fetched_at ?? '未知'} 的缓存）` : '';
        showStatus(
          data.matches.length ? `找到 ${data.matches.length} 个候选，点一条填入价格${cache}` : `没有精确候选，请手填单价${cache}`,
          data.matches.length > 0,
        );
      } catch (error) {
        showStatus(error instanceof Error ? error.message : String(error), false);
      } finally {
        lookupButton.disabled = false;
      }
    }

    const priceBox = el(
      'div',
      'lab-model-prices',
      el('h4', 'lab-h4', '价格（美元 / 百万 token）'),
      el('p', 'lab-field-help', '只用于成本统计，不影响请求；四项都留空表示不计算成本。缓存写入价：DeepSeek 这类自动缓存不单独收费，填 0；其他厂商的写入费当前接口不返回，只保存展示。'),
      el(
        'div',
        'lab-model-grid',
        field('输入（缓存未命中）', priceInput, '厂商挂牌价，例如 DeepSeek V4.1 Flash 是 0.15'),
        field('缓存命中', priceCacheRead, '缓存命中 token 的单价，例如 0.003'),
        field('缓存写入（没有就填 0）', priceCacheWrite, 'DeepSeek 不单独收费；其他厂商的写入费只保存展示'),
        field('输出', priceOutput, '例如 0.6'),
      ),
      el('div', 'lab-price-actions', lookupButton, el('span', 'lab-field-help', '按模型 ID 在 models.dev 里匹配；也可以手填覆盖')),
      candidates,
    );

    const errorBox = el('ul', 'lab-model-errors');
    errorBox.hidden = true;
    const save = button('保存', 'lab-btn lab-btn--primary', () => void submit());
    const cancel = button('取消', 'lab-btn', () => closeForm());

    async function submit() {
      const errors = validateProfileForm(state);
      const changedUrl = keySource !== undefined && state.base_url.trim().replace(/\/+$/, '') !== keySource.base_url;
      if (keySource && needsKey({ hasKey: keySource.has_key, baseUrlChanged: changedUrl, keyInForm: state.api_key })) {
        errors.push('修改 API 地址时必须重新输入 API 密钥，避免把旧密钥发到新地址');
      }
      if (errors.length) {
        errorBox.hidden = false;
        errorBox.replaceChildren(...errors.map((message) => el('li', '', message)));
        return;
      }
      errorBox.hidden = true;
      save.disabled = true;
      showStatus('保存中……');
      try {
        const payload = profilePayload(state);
        if (profile) await labApi(`/models/${profile.id}`, payload, 'PUT');
        else {
          const reuse = copyFrom ? reuseKeyId(copyFrom, state) : undefined;
          if (reuse) payload.copy_key_from = reuse;
          await labApi('/models', payload);
        }
        invalidateProfiles();
        closeForm();
        await load();
      } catch (error) {
        save.disabled = false;
        showStatus(error instanceof Error ? error.message : String(error), false);
      }
    }

    form.addEventListener('submit', (event) => {
      event.preventDefault();
      void submit();
    });
    form.append(
      el('h3', 'lab-h3', profile ? `编辑「${profile.name}」` : copyFrom ? `复制「${copyFrom.name}」为新档案` : '添加模型'),
      el(
        'div',
        'lab-model-grid',
        field('名称', name, '列表里显示的名字'),
        field('API 地址', baseUrl, '到 /v1 为止，不要带 /chat/completions'),
        field('API 协议', protocol, '目前只支持 OpenAI Chat Completions'),
        field(
          'API 密钥',
          keyRow,
          keySource?.has_key
            ? profile
              ? '已保存；留空表示不修改。修改地址时必须重填。'
              : `已保存于「${copyFrom?.name ?? ''}」；留空表示沿用同一密钥。修改地址时必须重填。`
            : '没有鉴权可以留空',
        ),
        fieldFor(
          '模型 ID',
          el('div', 'lab-model-model', modelCombo, el('div', 'lab-model-model-actions', testButton, discoverButton)),
          model.id,
          '接口文档里的 model 名称',
        ),
        field('上下文窗口', context, '支持 128K、1M；用于展示和预算提示'),
        field('最大输出 token', output, '实际请求的 max_tokens 不会超过这个值'),
        field('输入类型', inputTypes),
      ),
      priceBox,
      el('label', 'lab-check lab-model-reasoning-toggle', reasoningEnabled, el('span', '', '配置推理等级（按默认档位注入请求）')),
      reasoningBox,
      el('div', 'lab-model-form-actions', save, cancel),
      status,
      errorBox,
    );
    return form;
  }

  void load();
}
