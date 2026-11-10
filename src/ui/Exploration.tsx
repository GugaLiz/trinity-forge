import { branches, environmentHint, explorationHint, severity } from '../game/guidance';
import { danger } from '../game/engine';
import { isElement, RECIPE_MAP, tokenGlyph, tokenName } from '../game/recipes';
import type { Environment, Preview, Run } from '../game/types';
import { Icon } from './Icons';

export function ResourceForecast({
  run,
  preview,
  tokens,
  fixOrder,
}: {
  run: Run;
  preview: Preview;
  tokens: string[];
  fixOrder: () => void;
}) {
  if (!tokens.length)
    return (
      <div className="exploration-idle">
        <Icon name="spark" size={15} />
        <span>大胆试探：失败仅扣养分，不占回合</span>
      </div>
    );
  const prediction: Environment = preview.recipe
    ? preview.afterSuccess
    : { ...preview.afterInput, nutrients: Math.max(0, run.environment.nutrients - 1) };
  const reverse =
    tokens.length === 2 &&
    isElement(tokens[0]) &&
    !isElement(tokens[1]) &&
    branches(tokens[1]).length > 0;
  const risk = preview.recipe && danger(prediction).some(Boolean);
  return (
    <section className="forecast" aria-label="投入预测">
      <div className="forecast-heading">
        <span>
          {preview.recipe ? '预计炼成后 · 已计生态回补' : '投入影响 · 未成形则不改变温湿'}
        </span>
        {preview.highHumidity && <b>湿气失败 25%</b>}
      </div>
      <div className="forecast-values">
        {(['heat', 'moisture', 'nutrients'] as const).map((key, i) => (
          <span className={`severity-${severity(key, prediction[key])}`} key={key}>
            <small>{['温', '湿', '养'][i]}</small>
            {run.environment[key]}
            <i>→</i>
            <b>{prediction[key]}</b>
          </span>
        ))}
      </div>
      {risk && (
        <p className="forecast-risk" role="status">
          此结果将触发反噬，可能失去一件产物
        </p>
      )}
      {!risk && (
        <div className="exploration-clue">
          <span>
            {!preview.valid && tokens.length >= 2
              ? preview.reason
              : explorationHint(tokens, run.discovered)}
          </span>
          {reverse && <button onClick={fixOrder}>纠正顺序</button>}
        </div>
      )}
    </section>
  );
}

export function BranchClues({ token, known }: { token: string; known: Set<string> }) {
  const next = branches(token);
  return (
    <div className="branch-clues" aria-label={`${tokenName(token)}的延伸线索`}>
      {!next.length ? (
        <span className="branch-terminal">路径终点 · 留在生态区回补养分</span>
      ) : (
        next.map((recipe) => (
          <div className={known.has(recipe.id) ? 'branch-known' : 'branch-locked'} key={recipe.id}>
            <span>
              {tokenName(token)} → {known.has(recipe.id) ? tokenName(recipe.inputs[1]) : '?'} →{' '}
              <b>{known.has(recipe.id) ? recipe.name : '未发现'}</b>
            </span>
            {!known.has(recipe.id) && <small>{recipe.hint}</small>}
          </div>
        ))
      )}
    </div>
  );
}

export function GaugeNote({ type, value }: { type: keyof Environment; value: number }) {
  return <small className="gauge-hint">{environmentHint(type, value)}</small>;
}

export function CreationTree({ run }: { run: Run }) {
  const found = new Set(run.discovered);
  const roots = run.discovered.filter((id) => RECIPE_MAP[id].tier === 1);
  const node = (id: string) => (
    <span className={RECIPE_MAP[id].tier === 3 ? 'lineage-rare' : ''}>
      <Icon name={tokenGlyph(id)} size={19} />
      <b>{tokenName(id)}</b>
      <small>第 {run.logs.find((log) => log.output === id)?.turn ?? '—'} 回合</small>
    </span>
  );
  return (
    <details className="creation-tree" open>
      <summary>
        <Icon name="leaf" size={19} />
        本局造物脉络<small>{run.discovered.length} 种发现</small>
      </summary>
      {roots.length ? (
        <div className="lineage-list">
          {roots.map((root) => (
            <div className="lineage-root" key={root}>
              <p>
                {RECIPE_MAP[root].inputs.map(tokenName).join(' + ')}
                <Icon name="arrow" size={15} />
                {node(root)}
              </p>
              <ul>
                {branches(root)
                  .filter((r) => found.has(r.id))
                  .map((r) => (
                    <li key={r.id}>
                      <label>+ {tokenName(r.inputs[1])}</label>
                      {node(r.id)}
                      <ul>
                        {branches(r.id)
                          .filter((end) => found.has(end.id))
                          .map((end) => (
                            <li key={end.id}>
                              <label>+ {tokenName(end.inputs[1])}</label>
                              {node(end.id)}
                            </li>
                          ))}
                      </ul>
                    </li>
                  ))}
              </ul>
            </div>
          ))}
        </div>
      ) : (
        <p className="lineage-empty">本局尚无造物，下一炉从两象相遇开始。</p>
      )}
    </details>
  );
}
