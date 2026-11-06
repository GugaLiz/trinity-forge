import { useEffect, useRef, useState } from 'react';
import { ELEMENTS, TUTORIAL_TEXT } from '../game/config';
import { act, createRun, danger, getMaterials, preview, scoreRun } from '../game/engine';
import { isElement, RECIPES, RECIPE_MAP, tokenGlyph, tokenName } from '../game/recipes';
import type { Material, Profile, Run } from '../game/types';
import { loadData, saveData } from '../storage';
import { chime, suspendAudio } from '../platform/audio';
import { Furnace, Icon } from './Icons';
import Modal from './Modal';
import ForgeReaction from './ForgeReaction';
import type { Reaction } from './ForgeReaction';
import '../styles/forge-reaction.css';

const tierNames = ['两象', '催化', '万物'];
function freshSeed() {
  return crypto.getRandomValues(new Uint32Array(1))[0] || 1;
}
function App() {
  const [loaded] = useState(loadData);
  const [profile, setProfile] = useState(loaded.data.profile);
  const [run, setRun] = useState<Run | null>(loaded.data.run);
  const [screen, setScreen] = useState<'home' | 'game'>('home');
  const [selected, setSelected] = useState<string[]>([]);
  const [focusedSlot, setFocusedSlot] = useState<number | null>(null);
  const [tab, setTab] = useState<'elements' | 'eco'>('elements');
  const [overlay, setOverlay] = useState<'atlas' | 'help' | 'settings' | 'restart' | 'logs' | null>(
    null,
  );
  const [tier, setTier] = useState(1);
  const [reaction, setReaction] = useState<Reaction | null>(null);
  const [message, setMessage] = useState('');
  const [warning, setWarning] = useState(loaded.warning);
  const [pendingStart, setPendingStart] = useState<{ mode: Run['mode']; seed: number } | null>(
    null,
  );
  const busy = useRef(false);
  const settleTimer = useRef<number | undefined>(undefined);
  const [settling, setSettling] = useState(false);
  const runRef = useRef(run);
  runRef.current = run;
  const profileRef = useRef(profile);
  profileRef.current = profile;

  useEffect(() => {
    return () => window.clearTimeout(settleTimer.current);
  }, []);
  useEffect(() => {
    const pause = () => {
      if (document.hidden) {
        suspendAudio();
        document.documentElement.classList.add('is-paused');
      } else document.documentElement.classList.remove('is-paused');
    };
    document.addEventListener('visibilitychange', pause);
    return () => document.removeEventListener('visibilitychange', pause);
  }, []);
  useEffect(() => {
    document.documentElement.classList.toggle('reduced-motion', profile.reducedMotion);
  }, [profile.reducedMotion]);
  useEffect(() => {
    if (!message) return;
    const timeout = window.setTimeout(() => setMessage(''), 3200);
    return () => clearTimeout(timeout);
  }, [message]);

  function persist(nextProfile: Profile, nextRun: Run | null) {
    if (!saveData(nextProfile, nextRun)) setWarning('进度无法保存，请保持页面打开完成本局。');
  }
  function changeProfile(values: Partial<Profile>) {
    const next = { ...profileRef.current, ...values };
    profileRef.current = next;
    setProfile(next);
    persist(next, runRef.current);
    if (values.muted) suspendAudio();
  }
  function start(mode: Run['mode'], seed = freshSeed(), force = false) {
    if (!force && runRef.current?.status === 'playing' && runRef.current.mode === 'normal') {
      setPendingStart({ mode, seed });
      setOverlay('restart');
      return;
    }
    const next = createRun(mode, seed);
    runRef.current = next;
    setRun(next);
    setSelected([]);
    setFocusedSlot(null);
    setTab('elements');
    setReaction(null);
    busy.current = false;
    setSettling(false);
    window.clearTimeout(settleTimer.current);
    setOverlay(null);
    setScreen('game');
    setMessage('');
    persist(profileRef.current, next);
  }
  function choose(item: Material) {
    if (reaction || selected.includes(item.id)) return;
    if (selected.length === 3) {
      setMessage('炉中已满，点一下已投入的材料可撤回。');
      return;
    }
    setSelected([...selected, item.id]);
    setFocusedSlot(null);
    if (!profile.muted) chime('select');
  }
  function commit(type: 'forge' | 'rest') {
    if (busy.current || !run || runRef.current !== run) return;
    busy.current = true;
    const result = act(
      run,
      type === 'forge' ? { type, ids: selected, turn: run.turn } : { type, turn: run.turn },
    );
    if (result.error) {
      setMessage(result.error);
      busy.current = false;
      return;
    }
    setSettling(true);
    const next = result.run;
    runRef.current = next;
    setRun(next);
    setSelected([]);
    setFocusedSlot(null);
    let nextProfile = { ...profileRef.current };
    if (next.mode === 'normal') {
      nextProfile.discovered = [...new Set([...nextProfile.discovered, ...next.discovered])];
      if (next.status !== 'playing')
        nextProfile.bestScore = Math.max(nextProfile.bestScore, scoreRun(next).total);
    } else if (next.status === 'learned') nextProfile.tutorialDone = true;
    profileRef.current = nextProfile;
    setProfile(nextProfile);
    persist(nextProfile, next);
    if (type === 'forge') {
      const reduced =
        nextProfile.reducedMotion || window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      setReaction({ before: run, after: next, duration: reduced ? 180 : 1300 });
      if (!nextProfile.muted) chime('working');
    } else {
      if (!nextProfile.muted) chime('rest');
      setMessage(
        `调息完成 · 养分 ${run.environment.nutrients} → ${next.environment.nutrients} · 炉温 ${next.environment.heat} · 湿度 ${next.environment.moisture}`,
      );
      settleTimer.current = window.setTimeout(() => {
        busy.current = false;
        setSettling(false);
      }, 400);
    }
  }
  function closeReaction() {
    if (reaction) {
      const output = reaction.after.logs.at(-1)?.output;
      if (output && reaction.after.ecosystem.some((m) => m.token === output)) setTab('eco');
    }
    setReaction(null);
    busy.current = false;
    setSettling(false);
  }
  function moveSlot(direction: number) {
    if (focusedSlot === null) return;
    const target = focusedSlot + direction;
    if (target < 0 || target >= selected.length) return;
    const next = [...selected];
    [next[focusedSlot], next[target]] = [next[target], next[focusedSlot]];
    setSelected(next);
    setFocusedSlot(target);
  }

  const p = run ? preview(run, selected) : null;
  const selection = run ? getMaterials(run, selected) : [];
  const last = run?.logs.at(-1);
  const known = new Set([...profile.discovered, ...(run?.discovered ?? [])]);
  const saved = run?.mode === 'normal' && run.status === 'playing';
  const playing = screen === 'game' && run?.status === 'playing';

  return (
    <div className={`app-shell ${playing ? 'in-game' : ''}`}>
      <div className="paper-grain" aria-hidden="true" />
      {warning && (
        <div className="storage-warning" role="status">
          {warning}
          <button onClick={() => setWarning('')} aria-label="关闭存储提示">
            ×
          </button>
        </div>
      )}
      <header className="topbar">
        {screen === 'game' ? (
          <button
            className="icon-button"
            onClick={() => {
              setScreen('home');
              setSelected([]);
            }}
            aria-label="返回首页"
          >
            <Icon name="back" />
          </button>
        ) : (
          <span className="brand-seal">三</span>
        )}
        <span className="topbar-title">{screen === 'game' ? '三 生 炉' : 'TRINITY FORGE'}</span>
        <div className="topbar-actions">
          <button
            className="icon-button"
            onClick={() => changeProfile({ muted: !profile.muted })}
            aria-label={profile.muted ? '开启音效' : '关闭音效'}
          >
            <Icon name={profile.muted ? 'mute' : 'sound'} size={20} />
          </button>
          <button className="icon-button" onClick={() => setOverlay('settings')} aria-label="设置">
            <span className="settings-dots">···</span>
          </button>
        </div>
      </header>

      {screen === 'home' && (
        <main className="home-screen">
          <div className="home-heading">
            <div className="chapter-label">
              <span />万 物 生<span />
            </div>
            <h1>
              三生炉<span className="title-dot">·</span>
            </h1>
            <p className="home-subtitle">一炉三象，万物自生</p>
          </div>
          <div className="home-scene">
            <Furnace />
            <span className="scene-caption">水火相济 · 厚土载生</span>
          </div>
          <div className="home-intro">
            <p>投入水、火与土，探寻造化的顺序。</p>
            <p>在十二次炉火之间，炼出你的万物。</p>
          </div>
          <div className="home-buttons">
            {saved ? (
              <>
                <button
                  className="primary-button"
                  onClick={() => {
                    setScreen('game');
                    setSelected([]);
                  }}
                >
                  <span>续燃炉火</span>
                  <small>第 {run.turn} / 12 回合</small>
                  <Icon name="arrow" size={22} />
                </button>
                <button className="text-button" onClick={() => start('normal')}>
                  另启一炉
                </button>
              </>
            ) : (
              <button className="primary-button" onClick={() => start('normal')}>
                <span>开始炼化</span>
                <small>十二回合 · 八种发现</small>
                <Icon name="arrow" size={22} />
              </button>
            )}
            <div className="home-links">
              <button onClick={() => start('tutorial')}>
                <Icon name="spark" size={18} />
                入炉修习 <small>3 回合</small>
              </button>
              <i />
              <button onClick={() => setOverlay('atlas')}>
                <Icon name="book" size={18} />
                万物图鉴 <small>{profile.discovered.length}/28</small>
              </button>
            </div>
          </div>
          <footer className="home-footer">
            <span>一 生 二 · 二 生 三 · 三 生 万 物</span>
            <button onClick={() => setOverlay('help')} aria-label="玩法说明">
              <Icon name="help" size={16} />
            </button>
          </footer>
        </main>
      )}

      {playing && run && (
        <main className="game-screen">
          <div className="run-meta">
            <span>
              {run.mode === 'tutorial' ? '入炉修习' : '造 化 之 旅'}{' '}
              <b>{String(run.turn).padStart(2, '0')}</b>
              <small>/ {run.mode === 'tutorial' ? '03' : '12'}</small>
            </span>
            <button onClick={() => setOverlay('atlas')}>
              <Icon name="book" size={16} />
              本局 {run.discovered.length}
              <small>/{run.mode === 'tutorial' ? '3' : '8'}</small>
            </button>
          </div>
          <section className="environment" aria-label="环境槽">
            {(['heat', 'moisture', 'nutrients'] as const).map((key, i) => (
              <div
                className={`gauge gauge-${key} ${danger(run.environment)[i] ? 'danger' : ''}`}
                key={key}
              >
                <div>
                  <Icon name={['fire', 'water', 'leaf'][i]} size={15} />
                  <span>{['炉温', '湿度', '养分'][i]}</span>
                  <strong>{run.environment[key]}</strong>
                  <small>/10</small>
                </div>
                <div className="gauge-track">
                  <i style={{ width: `${run.environment[key] * 10}%` }} />
                </div>
                <small className="gauge-hint">
                  {key === 'heat'
                    ? run.forbidden
                      ? `本回合禁${tokenName(run.forbidden)}`
                      : '水降 · 火升'
                    : key === 'moisture'
                      ? run.environment.moisture >= 8
                        ? '失败风险 25%'
                        : run.environment.moisture === 0
                          ? '水系受限'
                          : '水升 · 土降'
                      : `生态回补 +${Math.min(3, run.ecosystem.length)}`}
                </small>
              </div>
            ))}
          </section>
          {run.mode === 'tutorial' && (
            <section className="tutorial-callout" aria-live="polite">
              <b>{TUTORIAL_TEXT[run.turn - 1].title}</b>
              <p>{TUTORIAL_TEXT[run.turn - 1].text}</p>
            </section>
          )}
          <section className="forge-section" aria-label="造化炉">
            <div className="forge-scene">
              <span className="vertical-script">万物有序</span>
              <Furnace compact />
              <span className="vertical-script">三象相生</span>
            </div>
            <div className="forge-heading">
              <span className="fine-line" />
              <span>按 序 入 炉</span>
              <span className="fine-line" />
            </div>
            <div className="input-slots">
              {[0, 1, 2].map((index) => (
                <div className="slot-wrap" key={index}>
                  {index > 0 && <span className="slot-arrow">›</span>}
                  <button
                    className={`input-slot ${selection[index] ? `filled tone-${isElement(selection[index].token) ? selection[index].token : 'product'}` : ''} ${focusedSlot === index ? 'focused' : ''}`}
                    aria-label={
                      selection[index]
                        ? `撤回${tokenName(selection[index].token)}`
                        : `输入槽 ${index + 1}`
                    }
                    onClick={() => {
                      if (selection[index]) {
                        setSelected(selected.filter((_, i) => i !== index));
                        setFocusedSlot(null);
                      }
                    }}
                  >
                    <span className="slot-number">0{index + 1}</span>
                    {selection[index] ? (
                      <>
                        <Icon name={tokenGlyph(selection[index].token)} size={25} />
                        <b>{tokenName(selection[index].token)}</b>
                        <span className="remove-hint">点按撤回</span>
                      </>
                    ) : (
                      <>
                        <span className="slot-plus">＋</span>
                        <small>待投入</small>
                      </>
                    )}
                  </button>
                </div>
              ))}
            </div>
            <div className="order-tools">
              <span>
                {selection.length > 1
                  ? '调整顺序'
                  : selection.length
                    ? '点已投材料可撤回'
                    : '从下方选取 2–3 份材料'}
              </span>
              {selection.length > 1 && (
                <div>
                  {selection.map((_, i) => (
                    <button
                      key={i}
                      className={focusedSlot === i ? 'active' : ''}
                      onClick={() => setFocusedSlot(i)}
                      aria-label={`选中第${i + 1}槽调序`}
                    >
                      {i + 1}
                    </button>
                  ))}
                  <button
                    disabled={focusedSlot === null || focusedSlot === 0}
                    onClick={() => moveSlot(-1)}
                    aria-label="向左移动"
                  >
                    ←
                  </button>
                  <button
                    disabled={focusedSlot === null || focusedSlot >= selected.length - 1}
                    onClick={() => moveSlot(1)}
                    aria-label="向右移动"
                  >
                    →
                  </button>
                </div>
              )}
            </div>
            <div
              className={`prediction ${p?.highHumidity && selection.length > 1 ? 'risk' : ''}`}
              aria-live="polite"
            >
              {selection.length < 2 ? (
                <>
                  <Icon name="spark" size={15} />
                  <span>基础合成无序，产物催化有序</span>
                </>
              ) : !p?.valid ? (
                <span>{p?.reason}</span>
              ) : (
                <>
                  <span>
                    {p.recipe && known.has(p.recipe.id)
                      ? `可化为「${p.recipe.name}」`
                      : '未知之序，待你发现'}
                    {p.highHumidity ? ' · 失败风险 25%' : ''}
                  </span>
                  <small>
                    {p.recipe && known.has(p.recipe.id)
                      ? `成功并回补后：温 ${p.afterSuccess.heat} · 湿 ${p.afterSuccess.moisture} · 养 ${p.afterSuccess.nutrients}${danger(p.afterSuccess).some(Boolean) ? ' · 将触发失衡' : ''}`
                      : '至少消耗 1 养分 · 配方失败保留材料'}
                  </small>
                </>
              )}
            </div>
          </section>
          <section className="materials-section" aria-label="材料区">
            <div className="material-tabs" role="tablist" aria-label="材料来源">
              <button
                role="tab"
                aria-selected={tab === 'elements'}
                className={tab === 'elements' ? 'active' : ''}
                onClick={() => setTab('elements')}
              >
                基础元素 <small>06</small>
              </button>
              <button
                role="tab"
                aria-selected={tab === 'eco'}
                className={tab === 'eco' ? 'active' : ''}
                onClick={() => setTab('eco')}
              >
                生态产物 <small>{String(run.ecosystem.length).padStart(2, '0')}</small>
              </button>
            </div>
            <div
              className="materials-scroll"
              role="tabpanel"
              aria-label={tab === 'elements' ? '基础元素' : '生态产物'}
            >
              {tab === 'elements' ? (
                <div className="material-grid">
                  {run.hand.map((item) => (
                    <MaterialCard
                      key={item.id}
                      item={item}
                      selected={selected.includes(item.id)}
                      disabled={item.token === run.forbidden || selected.includes(item.id)}
                      onChoose={choose}
                    />
                  ))}
                </div>
              ) : run.ecosystem.length ? (
                <div className="material-grid ecosystem-grid">
                  {[...new Set(run.ecosystem.map((m) => m.token))].map((token) => {
                    const copies = run.ecosystem.filter((m) => m.token === token);
                    const item = copies.find((m) => !selected.includes(m.id)) ?? copies[0];
                    return (
                      <MaterialCard
                        key={token}
                        item={item}
                        count={copies.length}
                        selected={copies.every((m) => selected.includes(m.id))}
                        disabled={copies.every((m) => selected.includes(m.id))}
                        onChoose={choose}
                      />
                    );
                  })}
                </div>
              ) : (
                <div className="empty-eco">
                  <Icon name="leaf" size={30} />
                  <p>炉火初燃，万物未生</p>
                  <small>合成后的产物会在这里回补养分</small>
                </div>
              )}
            </div>
          </section>
          <button
            className="event-summary"
            onClick={() => setOverlay('logs')}
            aria-label="查看炉记"
          >
            <span className={`event-dot ${last?.output ? 'lit' : ''}`} />
            <span>{last ? last.messages[0] : '炉火已备，等候第一份材料。'}</span>
            <span>炉记 ›</span>
          </button>
          <footer className="game-actions">
            <button
              className="rest-button"
              onClick={() => commit('rest')}
              disabled={run.mode === 'tutorial' || settling}
            >
              <Icon name="rest" size={21} />
              <span>
                调息<small>恢复资源</small>
              </span>
            </button>
            <button
              className="primary-button forge-button"
              onClick={() => commit('forge')}
              disabled={!p?.valid || settling}
            >
              <Icon name="spark" size={22} />
              <span>
                合 成
                <small>
                  {settling ? '炉火结算中' : selected.length ? '确认当前顺序' : '先投入材料'}
                </small>
              </span>
              <Icon name="arrow" size={22} />
            </button>
          </footer>
        </main>
      )}

      {screen === 'game' && run && run.status !== 'playing' && (
        <main className="result-screen">
          <span className="eyebrow">
            {run.status === 'learned' ? 'THE FIRST CREATION' : 'THE FORGE RESTS'}
          </span>
          <div className={`result-emblem ${run.status === 'lost' ? 'dim' : ''}`}>
            <Icon
              name={run.status === 'learned' ? 'rain' : run.status === 'won' ? 'forest' : 'rest'}
              size={68}
            />
          </div>
          <h1>
            {run.status === 'learned' ? '初识造化' : run.status === 'won' ? '万物初成' : '炉火暂歇'}
          </h1>
          <p>
            {run.status === 'learned'
              ? '从水火相遇，到第一场雨。接下来，去发现属于你的万物。'
              : run.status === 'won'
                ? '十二次炉火，炼出一方生机。'
                : danger(run.environment).every(Boolean)
                  ? '三象俱失。下一炉，记得留一点余地。'
                  : '本局发现未满八种。换一种顺序，再试一次。'}
          </p>
          {run.status !== 'learned' && (
            <div className="score-block">
              <span>本局造化分</span>
              <strong>{scoreRun(run).total}</strong>
              <div>
                <span>发现 {scoreRun(run).discovery}</span>
                <span>稳定 {scoreRun(run).stability}</span>
                <span>养分 {scoreRun(run).nutrients}</span>
              </div>
              <small>
                本局 {run.discovered.length}/8 种 · 最佳 {profile.bestScore} 分
              </small>
            </div>
          )}
          <div className="result-discoveries">
            {run.discovered.map((id) => (
              <span
                key={id}
                title={tokenName(id)}
                className={RECIPE_MAP[id].tier === 3 ? 'rare' : ''}
              >
                <Icon name={tokenGlyph(id)} size={24} />
                <small>{tokenName(id)}</small>
              </span>
            ))}
          </div>
          <button className="primary-button" onClick={() => start('normal')}>
            <span>{run.status === 'learned' ? '开启造化之旅' : '再启一炉'}</span>
            <Icon name="arrow" />
          </button>
          <button className="text-button" onClick={() => setScreen('home')}>
            回到炉前
          </button>
        </main>
      )}

      {overlay === 'atlas' && (
        <Modal title="万物图鉴" className="atlas-modal" onClose={() => setOverlay(null)}>
          <p className="modal-lead">
            历史收录 {profile.discovered.length} / 28{' '}
            <span>本局发现 {run?.discovered.length ?? 0}</span>
          </p>
          <div className="atlas-tabs">
            {tierNames.map((name, i) => (
              <button
                key={name}
                className={tier === i + 1 ? 'active' : ''}
                onClick={() => setTier(i + 1)}
              >
                {['一', '二', '三'][i]} · {name}
                <small>
                  {RECIPES.filter((r) => r.tier === i + 1 && known.has(r.id)).length}/
                  {[9, 12, 7][i]}
                </small>
              </button>
            ))}
          </div>
          <div className="atlas-list">
            {RECIPES.filter((r) => r.tier === tier).map((recipe) => (
              <article
                key={recipe.id}
                className={`atlas-entry ${known.has(recipe.id) ? 'unlocked' : 'locked'}`}
              >
                <div className="atlas-glyph">
                  <Icon name={known.has(recipe.id) ? recipe.glyph : 'spark'} size={30} />
                </div>
                <div>
                  <h3>
                    {known.has(recipe.id) ? recipe.name : '未见之物'}
                    {run?.discovered.includes(recipe.id) && <small>本局</small>}
                  </h3>
                  <p>
                    {known.has(recipe.id)
                      ? recipe.inputs.map(tokenName).join(recipe.ordered ? ' → ' : ' + ')
                      : recipe.hint}
                  </p>
                  {known.has(recipe.id) && (
                    <small>
                      {recipe.description} · {recipe.score} 分
                    </small>
                  )}
                </div>
              </article>
            ))}
          </div>
          <div className="atlas-note">两象配方无序 · 催化与万物需按顺序投入</div>
        </Modal>
      )}
      {overlay === 'help' && (
        <Modal title="炉前须知" onClose={() => setOverlay(null)}>
          <div className="help-content">
            <p>
              <b>一 · 投入</b>每回合从手牌或生态区点选 2–3 份材料，编号就是顺序。点已投材料可撤回。
            </p>
            <p>
              <b>二 · 合成</b>
              基础元素组合不计顺序；高层配方要先投入已有产物，再加入元素。成功后，前置产物会被消耗。
            </p>
            <p>
              <b>三 · 平衡</b>水降温增湿，火升温，土降湿。合成消耗 1
              基础养分及配方资源；生态每件回补 1 养分，每回合最多 3。
            </p>
            <p>
              <b>失衡与调息</b>炉温、湿度触及 0 或 10，或养分为 0
              时，会随机损失一个产物。三槽同时危险立即失败。调息回养分并使温湿靠近中值。
            </p>
            <p>
              <b>十二回合</b>发现至少 8
              种不同产物即通关。节点只在本局首见计分，加上稳定度与剩余养分。
            </p>
            <p>
              <b>随时续玩</b>每回合自动保存。刷新后点「续燃炉火」恢复；未确认的材料需重选。
            </p>
          </div>
          <button
            className="primary-button"
            onClick={() => {
              setOverlay(null);
              start('tutorial');
            }}
          >
            入炉修习
            <Icon name="arrow" />
          </button>
        </Modal>
      )}
      {overlay === 'settings' && (
        <Modal title="炉间设置" onClose={() => setOverlay(null)}>
          <div className="setting-row">
            <div>
              <b>炉火音韵</b>
              <small>操作与发现的轻音反馈</small>
            </div>
            <button
              className={`toggle ${!profile.muted ? 'on' : ''}`}
              role="switch"
              aria-checked={!profile.muted}
              aria-label="炉火音韵"
              onClick={() => {
                changeProfile({ muted: !profile.muted });
                if (profile.muted) chime('select');
              }}
            >
              <i />
            </button>
          </div>
          <div className="setting-row">
            <div>
              <b>减少动态</b>
              <small>停用呼吸光晕与浮动效果</small>
            </div>
            <button
              className={`toggle ${profile.reducedMotion ? 'on' : ''}`}
              role="switch"
              aria-checked={profile.reducedMotion}
              aria-label="减少动态"
              onClick={() => changeProfile({ reducedMotion: !profile.reducedMotion })}
            >
              <i />
            </button>
          </div>
          <button className="setting-link" onClick={() => setOverlay('help')}>
            查看玩法说明
            <Icon name="arrow" size={18} />
          </button>
          <button className="setting-link" onClick={() => start('normal', 20261106)}>
            开启固定演示局
            <Icon name="arrow" size={18} />
          </button>
          <p className="settings-foot">
            移动端竖屏 H5 · v0.1.0
            <br />
            {run ? `本局种子 ${run.seed}` : '进度仅保存在当前浏览器'}
          </p>
        </Modal>
      )}
      {overlay === 'restart' && (
        <Modal
          title="另启一炉？"
          onClose={() => {
            setOverlay(null);
            setPendingStart(null);
          }}
        >
          <p className="modal-lead">当前对局将被替换，历史图鉴与最佳成绩会保留。</p>
          <button
            className="primary-button"
            onClick={() => {
              if (pendingStart) start(pendingStart.mode, pendingStart.seed, true);
              setPendingStart(null);
            }}
          >
            确认开新局
            <Icon name="arrow" />
          </button>
          <button className="text-button" onClick={() => setOverlay(null)}>
            保留这炉
          </button>
        </Modal>
      )}
      {overlay === 'logs' && (
        <Modal title="造化炉记" onClose={() => setOverlay(null)}>
          <div className="log-list">
            {run?.logs.length ? (
              [...run.logs].reverse().map((log) => (
                <article key={log.turn}>
                  <span>第 {log.turn} 回合</span>
                  {log.messages.map((text, i) => (
                    <p key={i}>{text}</p>
                  ))}
                  <small>
                    炉温 {log.environment.heat} · 湿度 {log.environment.moisture} · 养分{' '}
                    {log.environment.nutrients}
                  </small>
                </article>
              ))
            ) : (
              <p className="modal-lead">尚无炉记，第一份造化正等你开启。</p>
            )}
          </div>
        </Modal>
      )}
      {reaction && (
        <ForgeReaction
          reaction={reaction}
          onClose={closeReaction}
          onReveal={() => {
            const output = reaction.after.logs.at(-1)?.output;
            if (!profileRef.current.muted)
              chime(output ? (RECIPE_MAP[output].tier === 3 ? 'rare' : 'forge') : 'failure');
          }}
        />
      )}
      {message && (
        <div className="toast" role="status">
          {message}
        </div>
      )}
      <div className="rotate-hint">
        <Icon name="rest" size={32} />
        <h2>请竖起手机</h2>
        <p>这一炉的造化，适合慢慢向上生长。</p>
        <small>当前进度已保留</small>
      </div>
    </div>
  );
}

function MaterialCard({
  item,
  count,
  selected,
  disabled,
  onChoose,
}: {
  item: Material;
  count?: number;
  selected: boolean;
  disabled: boolean;
  onChoose: (m: Material) => void;
}) {
  const base = isElement(item.token);
  return (
    <button
      className={`material-card tone-${base ? item.token : 'product'} ${selected ? 'selected' : ''}`}
      disabled={disabled}
      onClick={() => onChoose(item)}
      aria-label={`投入${tokenName(item.token)}${count ? `，剩余${count}份` : ''}`}
    >
      <Icon name={tokenGlyph(item.token)} size={26} />
      <div>
        <b>{tokenName(item.token)}</b>
        <small>
          {base
            ? ELEMENTS[item.token as keyof typeof ELEMENTS].label
            : `${tierNames[RECIPE_MAP[item.token].tier - 1]}产物`}
        </small>
      </div>
      <span className="card-mark">{selected ? '✓' : count ? `×${count}` : '+'}</span>
    </button>
  );
}
export default App;
