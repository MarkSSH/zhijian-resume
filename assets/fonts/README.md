# 纸间封面字体

`zhijian-brush.woff2` is a WOFF2 character subset of **Ma Shan Zheng**, by the Ma Shan Zheng Project Authors, licensed under the SIL Open Font License 1.1. See [OFL-MaShanZheng.txt](./OFL-MaShanZheng.txt) for the copyright notice and full license.

- Upstream: https://github.com/googlefonts/mashanzheng
- Distribution source: https://github.com/google/fonts/tree/main/ofl/mashanzheng
- Included characters: `纸间写自己下一页，你。未完待续`
- Subset generated with fontTools; no glyph shapes were changed.

This subset is for the cover wordmark and decorative paper heading. Other Chinese text uses the existing system font stacks; English retains Georgia. Add characters to this subset if the brush text changes.

```sh
python -m fontTools.subset MaShanZheng-Regular.ttf --text='纸间写自己下一页，你。未完待续' --flavor=woff2 --output-file=zhijian-brush.woff2
```
