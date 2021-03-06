import { Asset } from './Asset';
import HTMLAsset = require('parcel-bundler/lib/assets/HTMLAsset');

import load = require('pug-load');
import lexer = require('pug-lexer');
import parser = require('pug-parser');
import walk = require('pug-walk');
import linker = require('pug-linker');
import generateCode = require('pug-code-gen');
import wrap = require('pug-runtime/wrap');
import filters = require('pug-filters');

interface Dictionary<T> {
  [key: string]: T;
}

interface Node {
  type: string;
  line: number;
  column: number | null;
  filename: string | null;
}

interface Block extends Node {
  nodes: Node[];
}

// A list of all attributes that should produce a dependency
// Based on https://developer.mozilla.org/en-US/docs/Web/HTML/Attributes
const ATTRS: Dictionary<string[]> = {
  src: [
    'script',
    'img',
    'audio',
    'video',
    'source',
    'track',
    'iframe',
    'embed'
  ],
  srcset: ['img'],
  href: ['link', 'a'],
  poster: ['video']
};

// A regex to detect if a variable is a 'pure' string (no evaluation needed)
const PURE_STRING_REGEX: RegExp = /(^"([^"]+)"$)|(^'([^']+)'$)/g;

export = class PugAsset extends Asset {
  public type = 'html';

  constructor(name: string, pkg: string, options: any) {
    super(name, pkg, options);
  }

  public parse(code: string) {
    let ast = load.string(code, {
      lex: lexer,
      parse: parser,
      filename: this.name
    });

    ast = linker(ast);
    ast = filters.handleFilters(ast);

    return ast;
  }

  public collectDependencies(): void {
    walk(this.ast, node => {
      const recursiveCollect = (cNode: Block | Node) => {
        if (cNode.type === 'Block') {
          (cNode as Block).nodes.forEach((n: any) => recursiveCollect(n));
        } else {
          if (cNode.filename && cNode.filename !== this.name && !this.dependencies.has(cNode.filename)) {
            this.addDependency(cNode.filename, {
              name: cNode.filename,
              includedInParent: true,
            });
          }
        }
      };

      recursiveCollect(node);

      if (node.attrs) {
        for (const attr of node.attrs) {
          const elements = ATTRS[attr.name];
          if (node.type === 'Tag' && elements && elements.indexOf(node.name) > -1) {
            if (PURE_STRING_REGEX.test(attr.val)) {
              const assetPath = attr.val.substring(1, attr.val.length - 1);
              this.addURLDependency(assetPath);
            }
          }
        }
      }
      return node;
    });
  }

  public async process(): Promise<any> {
    await super.process();

    const htmlAsset = new HTMLAsset(this.name, this.package, this.options);
    htmlAsset.contents = this.generated.html;
    await htmlAsset.process();

    Object.assign(this, htmlAsset);

    return this.generated;
  }

  public generate() {
    const result = generateCode(this.ast, {
      compileDebug: false,
      pretty: !this.options.minify
    });

    return { html: wrap(result)() };
  }

  public shouldInvalidate(): boolean {
    return false;
  }
};
