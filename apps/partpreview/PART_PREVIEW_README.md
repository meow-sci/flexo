This "part preview" subapp is meant to be embedded in an <iframe> in a wiki.gg site.

This works by using a mediawiki gadget where we can define custom JS and CSS.

To keep things simple I plan to just use a simple bit of JS which uses the mediawiki JS api to manipulate some HTML markup we can control in the regular user authored created content like div's with a well-known class name.

Here is an example PoC:

https://kittenspaceagency.wiki.gg/wiki/MediaWiki:Gadget-flexo.css

```css
/* no css needed */
```

https://kittenspaceagency.wiki.gg/wiki/MediaWiki:Gadget-flexo.js

```javascript
mw.hook('wikipage.content').add(function () {
  var els = document.getElementsByClassName('flexo-part-preview');

  Array.prototype.slice.call(els).forEach(function (el) {
    if (el.dataset.flexoLoaded) {
      return;
    }
    el.dataset.flexoLoaded = '1';

    el.innerHTML =
      '<iframe src="https://meow.science.fail/flexo/"' +
      ' title="Flexo" loading="lazy" referrerpolicy="no-referrer"' +
      ' sandbox="allow-scripts allow-same-origin allow-popups"' +
      ' style="display:block;width:100%;aspect-ratio:16/10;border:0"></iframe>';
  });
});
```

https://kittenspaceagency.wiki.gg/wiki/MediaWiki:Gadget-flexo

```
flexo embed description goes here
```

https://kittenspaceagency.wiki.gg/wiki/MediaWiki:Gadgets-definition

```ini
== Tools ==
* flexo[ResourceLoader|default|hidden|dependencies=mediawiki.util]|flexo.js|flexo.css

<div class="flexo-embed"></div>
```

# real javascript snippet

use docs/wiki-part-preview.md as the reference for how the part-preview app works

- must use iframe URL `https://meow.science.fail/flexo/apps/partpreview/`
- must read data attributes from the discovered divs with class `flexo-part-preview`:
  - `data-part-id` which is the `part_id` query param value to use
  - `data-skybox-id` which is the `skybox_id` query param value to use (if no data attribute dont set this)
  - `data-connectors` if set set `connectors=true` query param, otherwise unset
  - `data-measure` if set set `measure=true` query param, otherwise unset
  - `data-width` / `data-height` if set, applied as inline styles on the iframe so they
    override the gadget stylesheet (a bare number is treated as `px`, anything else —
    `50%`, `20em`, `min(100%,400px)` — is passed through as-is)

```javascript
mw.hook('wikipage.content').add(function () {
  var BASE = 'https://meow.science.fail/flexo/apps/partpreview/'; // trailing slash is required
  var els = document.getElementsByClassName('flexo-part-preview');

  Array.prototype.slice.call(els).forEach(function (el) {
    if (el.dataset.flexoLoaded) {
      return;
    }

    var partId = el.dataset.partId;
    if (!partId) {
      return;
    } // nothing to render without a part_id

    el.dataset.flexoLoaded = '1';

    var params = ['part_id=' + encodeURIComponent(partId)];

    if (el.dataset.skyboxId) {
      params.push('skybox_id=' + encodeURIComponent(el.dataset.skyboxId));
    }
    if (el.dataset.connectors !== undefined) {
      params.push('connectors=true');
    }
    if (el.dataset.measure !== undefined) {
      params.push('measure=true');
    }

    var src = BASE + '?' + params.join('&');

    // a bare number means px; anything else ('50%', '20em', …) is passed through
    var toCssLength = function (v) {
      return /^-?\d*\.?\d+$/.test(v) ? v + 'px' : v;
    };

    var iframe = document.createElement('iframe');
    iframe.src = src;
    iframe.title = 'Part preview: ' + partId;
    iframe.loading = 'lazy';
    iframe.referrerPolicy = 'no-referrer';
    iframe.classList.add('flexo-part-preview');
    iframe.setAttribute('sandbox', 'allow-scripts allow-popups');
    iframe.setAttribute('allow', 'clipboard-write');
    console.log;
    // inline styles beat the gadget stylesheet
    if (el.dataset.width) {
      console.log(`setting width to ${toCssLength(el.dataset.width)}`);
      iframe.style.width = toCssLength(el.dataset.width);
    }
    if (el.dataset.height) {
      console.log(`setting width to ${toCssLength(el.dataset.height)}`);
      iframe.style.height = toCssLength(el.dataset.height);
    }

    el.innerHTML = '';
    el.appendChild(iframe);
  });
});
```

```css
iframe.flexo-part-preview {
  display: inline-block;
  width: 250px;
  height: 250px;
  border: 0;
}
```

Usage in wiki content:

```html
<div class="flexo-part-preview" data-part-id="CoreCommandA_Prefab_MediumCapsuleVariantA"></div>
<div class="flexo-part-preview" data-part-id="CoreCommandA_Prefab_MediumCapsuleVariantA"></div>
<div class="flexo-part-preview" data-part-id="CoreCommandA_Prefab_MediumCapsuleVariantA"></div>
<div class="flexo-part-preview" data-part-id="CoreCommandA_Prefab_MediumCapsuleVariantA"></div>
<div class="flexo-part-preview" data-part-id="CoreCommandA_Prefab_MediumCapsuleVariantA"></div>
<div class="flexo-part-preview" data-part-id="CoreCommandA_Prefab_MediumCapsuleVariantA"></div>
<div class="flexo-part-preview" data-part-id="CoreCommandA_Prefab_MediumCapsuleVariantA"></div>
<div class="flexo-part-preview" data-part-id="CoreCommandA_Prefab_MediumCapsuleVariantA"></div>
<div class="flexo-part-preview" data-part-id="CoreCommandA_Prefab_MediumCapsuleVariantA"></div>
<div class="flexo-part-preview" data-part-id="CoreCommandA_Prefab_MediumCapsuleVariantA"></div>
<div class="flexo-part-preview" data-part-id="CoreCommandA_Prefab_MediumCapsuleVariantA"></div>
<div class="flexo-part-preview" data-part-id="CoreCommandA_Prefab_MediumCapsuleVariantA"></div>
<div class="flexo-part-preview" data-part-id="CoreCommandA_Prefab_MediumCapsuleVariantA"></div>
<div class="flexo-part-preview" data-part-id="CoreCommandA_Prefab_MediumCapsuleVariantA"></div>
<div class="flexo-part-preview" data-part-id="CoreCommandA_Prefab_MediumCapsuleVariantA"></div>
<div class="flexo-part-preview" data-part-id="CoreCommandA_Prefab_MediumCapsuleVariantA"></div>
<div class="flexo-part-preview" data-part-id="CoreCommandA_Prefab_MediumCapsuleVariantA"></div>
<div class="flexo-part-preview" data-part-id="CoreCommandA_Prefab_MediumCapsuleVariantA"></div>
<div class="flexo-part-preview" data-part-id="CoreCommandA_Prefab_MediumCapsuleVariantA"></div>
<div class="flexo-part-preview" data-part-id="CoreCommandA_Prefab_MediumCapsuleVariantA"></div>
<div class="flexo-part-preview" data-part-id="CoreCommandA_Prefab_MediumCapsuleVariantA"></div>
<div class="flexo-part-preview" data-part-id="CoreCommandA_Prefab_MediumCapsuleVariantA"></div>
<div class="flexo-part-preview" data-part-id="CoreCommandA_Prefab_MediumCapsuleVariantA"></div>
<div class="flexo-part-preview" data-part-id="CoreCommandA_Prefab_MediumCapsuleVariantA"></div>
<div class="flexo-part-preview" data-part-id="CoreCommandA_Prefab_MediumCapsuleVariantA"></div>
<div class="flexo-part-preview" data-part-id="CoreCommandA_Prefab_MediumCapsuleVariantA"></div>
<div class="flexo-part-preview" data-part-id="CoreCommandA_Prefab_MediumCapsuleVariantA"></div>
<div class="flexo-part-preview" data-part-id="CoreCommandA_Prefab_MediumCapsuleVariantA"></div>

<div
  class="flexo-part-preview"
  data-part-id="CoreCommandA_Prefab_MediumCapsuleVariantA"
  data-skybox-id="kloofendal"
  data-connectors
  data-measure
></div>

<!-- override the stylesheet's 250x250 for a single embed -->
<div
  class="flexo-part-preview"
  data-part-id="CoreCommandA_Prefab_MediumCapsuleVariantA"
  data-width="640"
  data-height="400"
></div>
<div
  class="flexo-part-preview"
  data-part-id="CoreCommandA_Prefab_MediumCapsuleVariantA"
  data-width="100%"
  data-height="20em"
></div>
```
