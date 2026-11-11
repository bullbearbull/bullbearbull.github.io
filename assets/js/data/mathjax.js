---
layout: compress
# WARNING: Don't use '//' to comment out code, use '{% comment %}' and '{% endcomment %}' instead.
---

{%- comment -%}
  Override of Chirpy 7.6 assets/js/data/mathjax.js. Only the `loader` block is added:
  it points MathJax at the font files kept in assets/js/mathjax-newcm-font, so no
  font is fetched from a CDN.
{%- endcomment -%}

{%- comment -%}
  See: <https://docs.mathjax.org/en/latest/options/input/tex.html#tex-options>
{%- endcomment -%}

MathJax = {
  loader: {
    paths: {
      'mathjax-newcm': '{{ '/assets/js/mathjax-newcm-font' | relative_url }}'
    }
  },
  tex: {
    {%- comment -%} start/end delimiter pairs for in-line math {%- endcomment -%}
    inlineMath: [
      ['$', '$'],
      ['\\(', '\\)']
    ],
    {%- comment -%} start/end delimiter pairs for display math {%- endcomment -%}
    displayMath: [
      ['$$', '$$'],
      ['\\[', '\\]']
    ],
    {%- comment -%} equation numbering {%- endcomment -%}
    tags: 'ams'
  }
};
