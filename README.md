# CRESC.

[Chirpy](https://github.com/cotes2020/jekyll-theme-chirpy) 테마를 쓰는 Jekyll 블로그입니다. 배포 주소는 [https://bullbearbull.github.io](https://bullbearbull.github.io) 입니다.

Markets, Models & Rules — AI, 금융, 퀀트, 파생상품, 수학, 법·규제를 숫자와 근거로 풀어 씁니다.

## 글 추가하기

1. `_posts/` 아래에 Markdown 파일을 만듭니다. 파일 이름은 반드시 아래 형식이어야 합니다.

   ```text
   _posts/YYYY-MM-DD-slug.md
   ```

   예: `_posts/2026-11-09-volatility-and-data.md`

2. 파일 맨 위에 front matter를 넣습니다.

   ```yaml
   ---
   title: 글 제목
   date: 2026-11-09 21:00:00 +0900
   categories: [finance, quant]
   tags: [volatility, python]
   math: true
   ---
   ```

   - `layout: post`와 목차(`toc`)는 `_config.yml` 기본값으로 이미 켜져 있습니다.
   - 수학식(MathJax)도 포스트 기본값으로 `math: true`입니다. 수식이 없는 글은 `math: false`로 끌 수 있습니다.
   - 수식은 인라인 `$E=mc^2$`, 블록은 빈 줄을 두고 `$$ ... $$` 로 씁니다.

3. 본문은 그 아래에 Markdown으로 작성합니다.

## 이미지

글에서 쓰는 이미지는 슬러그별 폴더에 둡니다.

```text
assets/images/<post-slug>/example.png
```

글에서는 사이트 루트 기준 경로로 넣습니다.

```markdown
![설명](/assets/images/<post-slug>/example.png)
```

## 로컬에서 미리보기

Ruby와 Bundler가 필요합니다.

```bash
bundle install
bundle exec jekyll serve
```

브라우저에서 <http://127.0.0.1:4000> 을 엽니다. 배포 전에 빌드만 확인하려면:

```bash
bundle exec jekyll build
```

## GitHub Pages 배포

`main`에 푸시하면 [`.github/workflows/pages-deploy.yml`](.github/workflows/pages-deploy.yml) 워크플로가 사이트를 빌드해 배포합니다.

처음 한 번은 저장소 웹 UI에서 소스를 지정해야 합니다.

1. GitHub 저장소 → **Settings** → **Pages**
2. **Build and deployment** → **Source**에서 **GitHub Actions**를 선택합니다.

그다음 Actions 탭에서 `Build and Deploy`가 성공했는지 확인하면 됩니다.
