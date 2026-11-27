# openmake-marketplace

OpenMake 큐레이션 마켓플레이스 — **openmake_llm 에서 실제로 설치·동작을 확인한** 플러그인 목록입니다.
Claude Code 플러그인 마켓플레이스 규격(`.claude-plugin/marketplace.json`)을 그대로 따르므로
openmake_llm 과 Claude Code 양쪽에서 소스로 등록할 수 있습니다.

## 어떻게 쓰나

**openmake_llm** — 설정 → 확장 → 카탈로그 소스에 `openmake/openmake-marketplace` 를 등록하면
목록이 카탈로그에 나타납니다(기본 배포에는 이미 등록돼 있습니다).

**Claude Code**
```
/plugin marketplace add openmake/openmake-marketplace
/plugin install claude-security@openmake-marketplace
```

## 큐레이션 원칙

- 이 저장소는 **인덱스**입니다. 플러그인 본문은 각 상류 저장소에 있고 라이선스도 상류를 따릅니다.
- 모든 엔트리는 `ref` 로 **검증된 상류 커밋에 고정**됩니다. 상류가 바뀌어도 여기 목록은 검증 시점을 가리키며,
  갱신은 재검증 후 커밋으로만 합니다.
- 포함 기준: openmake_llm 에 설치돼 skills / custom agents / MCP 중 최소 하나가 실제로 동작함.
  (원격 MCP 는 OAuth 로그인까지 확인한 것만 "동작"으로 봅니다.)

## 카테고리

| category | 뜻 |
|---|---|
| security · development · productivity | 코드·도구 작업 |
| ai-ml · math · multimodal | 모델·데이터·수학·이미지 |
| design · automation | 디자인 워크플로 · 브라우저 자동화 |

## 엔트리 추가

`.claude-plugin/marketplace.json` 의 `plugins[]` 에 항목을 추가하고 PR 을 보내 주세요.
`source` 는 `git-subdir`(플러그인이 저장소 하위 디렉토리일 때) 또는 `url`(저장소 루트) 형태이며
`ref` 에 검증한 커밋 SHA 를 넣습니다. 상대 경로(`./plugins/…`) 엔트리는 이 저장소 안에 본문을 두는
경우에만 씁니다(현재 없음).

## 정적 색인 (index.json)

CI(`.github/workflows/catalog-index.yml`)가 main 이 바뀔 때마다 `marketplace.json` 으로 `index.json` 을 만들어
`catalog-index` 릴리스 자산으로 올립니다 — 형식은 `schema/catalog-index.v1.schema.json`.

```
https://github.com/openmake/openmake-marketplace/releases/download/catalog-index/index.json
```

openmake_llm 관리자 화면(설정 → 확장 → 카탈로그 원본)에서 이 주소를 **정적 색인 주소**로 지정하고
`EXTENSION_CATALOG_INDEX_ENABLED` 를 켜면 GitHub API 를 여러 번 부르지 않고 이 파일 하나로 동기화합니다.
색인이 없거나 해시가 맞지 않으면 앱은 종전 방식으로 동기화합니다.

- 외부 엔트리의 `ref` 가 40자 커밋이 아니거나 `github` 단축형 소스면 색인 생성이 실패합니다(검증된 ref 만).
- 로컬 확인: `node scripts/build-index.mjs --out dist/index.json && node scripts/build-index.mjs --verify dist/index.json`
