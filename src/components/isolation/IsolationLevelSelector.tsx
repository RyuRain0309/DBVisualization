import { ISOLATION_BEHAVIOR, ISOLATION_LEVELS, type IsolationLevel } from '../../engine/transaction/isolationLevel';
import { useEngineStore } from '../../store/engineStore';

interface Props {
  level: IsolationLevel;
  transactionOpen: boolean;
}

export function IsolationLevelSelector({ level, transactionOpen }: Props) {
  const run = useEngineStore((state) => state.run);

  return (
    <label
      className="field"
      title={
        transactionOpen
          ? '트랜잭션이 열려 있는 동안에는 바꿀 수 없다. MySQL 에서도 SET TRANSACTION ISOLATION LEVEL 은 다음 트랜잭션부터 적용된다.'
          : ISOLATION_BEHAVIOR[level].description
      }
    >
      격리수준
      <select
        value={level}
        disabled={transactionOpen}
        onChange={(event) => run(`SET TRANSACTION ISOLATION LEVEL ${event.target.value}`)}
      >
        {ISOLATION_LEVELS.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </label>
  );
}
