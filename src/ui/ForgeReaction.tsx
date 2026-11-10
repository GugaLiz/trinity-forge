import { useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import type { Run } from '../game/types';
import { RECIPE_MAP, matchRecipe, tokenGlyph, tokenName } from '../game/recipes';
import { Furnace, Icon } from './Icons';
import Modal from './Modal';

export type Reaction = { before: Run; after: Run; duration: number };

export default function ForgeReaction({
  reaction,
  onReveal,
  onClose,
}: {
  reaction: Reaction;
  onReveal: () => void;
  onClose: () => void;
}) {
  const [revealed, setRevealed] = useState(false);
  const [scrollable, setScrollable] = useState(false);
  const outcomeRef = useRef<HTMLDivElement>(null);
  const revealRef = useRef(onReveal);
  revealRef.current = onReveal;
  const log = reaction.after.logs.at(-1)!;
  const recipe = log.output ? RECIPE_MAP[log.output] : undefined;
  const rare = recipe?.tier === 3 && log.fresh;
  const survived =
    log.output &&
    reaction.after.ecosystem.some((m) => m.token === log.output && m.createdTurn === log.turn);
  const backlash = log.messages.filter((message) => /失衡|反噬/.test(message));
  const reversed = !recipe && matchRecipe([...log.inputs].reverse())?.ordered;
  const wetFailure = !recipe && log.messages[0].startsWith('湿气');
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setRevealed(true);
      revealRef.current();
    }, reaction.duration);
    return () => window.clearTimeout(timer);
  }, [reaction.duration]);
  useEffect(() => {
    if (!revealed || !outcomeRef.current) return;
    const content = outcomeRef.current;
    const check = () => setScrollable(content.scrollHeight > content.clientHeight + 1);
    check();
    const observer = new ResizeObserver(check);
    observer.observe(content);
    return () => observer.disconnect();
  }, [revealed]);

  return (
    <Modal
      title={!revealed ? '炉火炼化中' : rare ? '万物初生' : recipe ? '合成结果' : '合成未成'}
      className={`reaction-modal ${revealed ? 'reaction-revealed' : 'reaction-working'} ${recipe ? 'reaction-success' : 'reaction-failure'} ${rare ? 'reaction-rare' : ''}`}
      dismissible={revealed}
      onClose={onClose}
    >
      {!revealed ? (
        <div
          className="reaction-process"
          role="status"
          aria-live="polite"
          style={{ '--forge-duration': `${reaction.duration}ms` } as CSSProperties}
        >
          <span className="reaction-kicker">第 {log.turn} 回合 · 三象交融</span>
          <div className="reaction-furnace">
            <Furnace working elements={log.inputs} />
          </div>
          <div className="reaction-inputs">
            {log.inputs.map((token, i) => (
              <span key={i} className={`reaction-token tone-${token}`}>
                <Icon name={tokenGlyph(token)} size={22} />
                <b>{tokenName(token)}</b>
                {i < log.inputs.length - 1 && <i>+</i>}
              </span>
            ))}
          </div>
          <p className="process-caption">
            {log.inputs.includes('F') && log.inputs.includes('W')
              ? '炉火翻涌，水汽正升起…'
              : log.inputs.includes('W') ||
                  log.inputs.some((t) => ['steam', 'mist', 'cloud'].includes(t))
                ? '水雾萦绕，万物正在成形…'
                : log.inputs.includes('F')
                  ? '炉火渐盛，材料正在交融…'
                  : '炉身轻震，三象正在交融…'}
          </p>
          <div className="reaction-progress" role="progressbar" aria-label="炼化进度">
            <i />
          </div>
          <div className="process-steps">
            <span>点火</span>
            <span>交融</span>
            <span>成形</span>
          </div>
        </div>
      ) : (
        <>
          <div className="reaction-outcome" role="status" aria-live="polite" ref={outcomeRef}>
            <span className="reaction-kicker">
              {recipe
                ? `${['第一层 · 两象', '第二层 · 催化', '第三层 · 万物'][recipe.tier - 1]} · ${log.fresh ? '首次炼成' : '再次炼成'}`
                : wetFailure
                  ? '湿气扰炉'
                  : '顺序尚未成形'}
            </span>
            <div className="reaction-result-icon">
              <Icon name={recipe?.glyph ?? (wetFailure ? 'mist' : 'rest')} size={66} />
              <span />
              <span />
            </div>
            <h3>{recipe?.name ?? '本次未能合成'}</h3>
            <div className="reaction-equation">
              {log.inputs.map(tokenName).join(' + ')}
              <Icon name="arrow" size={18} />
              <strong>{recipe?.name ?? '未成形'}</strong>
            </div>
            <p className="reaction-description">
              {recipe?.description ??
                (wetFailure
                  ? '湿度过高，打断了这次炼化。'
                  : reversed
                    ? '催化要先投入产物，再加入元素。试着调换顺序。'
                    : (log.hint ?? '这组材料尚无配方，试着更换材料或调整顺序。'))}
            </p>
            {recipe ? (
              <div className="reaction-reward">
                {log.fresh ? (
                  <>
                    <Icon name="book" size={17} />
                    <span>图鉴 +1</span>
                    <b>发现 +{recipe.score} 分</b>
                  </>
                ) : (
                  <span>图鉴已收录 · 重复炼成不重复计分</span>
                )}
              </div>
            ) : (
              <p className="reaction-failure-note">
                仅消耗 1 基础养分 · 生态产物保留
                <br />
                本回合继续 · 手牌与生态材料都保留
              </p>
            )}
            {backlash.length > 0 && (
              <div className="reaction-backlash">
                <Icon name="fire" size={19} />
                <div>
                  {backlash.map((text) => (
                    <p key={text}>{text}</p>
                  ))}
                  {recipe && !survived && <p>新产物已被反噬摧毁，发现与得分仍然保留</p>}
                </div>
              </div>
            )}
            <div className="reaction-deltas" aria-label="本回合资源变化">
              {(['heat', 'moisture', 'nutrients'] as const).map((key, i) => {
                const delta = reaction.after.environment[key] - reaction.before.environment[key];
                return (
                  <div key={key}>
                    <span>{['炉温', '湿度', '养分'][i]}</span>
                    <b>
                      {reaction.before.environment[key]} <small>→</small>{' '}
                      {reaction.after.environment[key]}
                    </b>
                    <small className={delta > 0 ? 'delta-up' : delta < 0 ? 'delta-down' : ''}>
                      {delta > 0 ? `+${delta}` : delta === 0 ? '不变' : delta}
                    </small>
                  </div>
                );
              })}
            </div>
            <p className="reaction-resource-note">
              {log.advanced
                ? '资源变化已包含配方消耗与生态回补'
                : '试探不执行生态回补，也不触发回合反噬'}
            </p>
            {recipe && (
              <p className={`reaction-destination ${!survived ? 'is-lost' : ''}`}>
                {survived
                  ? `「${recipe.name}」已进入生态区，可继续催化并回补养分`
                  : `「${recipe.name}」已被反噬摧毁，发现与得分仍然保留`}
              </p>
            )}
          </div>
          {scrollable && <p className="reaction-scroll-hint">↑ 上滑查看完整结算</p>}
          <button className="primary-button reaction-continue" onClick={onClose}>
            <span>
              {rare
                ? '收录造化'
                : reaction.after.status !== 'playing'
                  ? '查看本局结果'
                  : recipe
                    ? survived
                      ? '收下产物'
                      : '继续炼化'
                    : '调整再试'}
            </span>
            <Icon name={recipe ? 'book' : 'arrow'} size={21} />
          </button>
        </>
      )}
    </Modal>
  );
}
