import { Editor, Node, mergeAttributes } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import Image from '@tiptap/extension-image';
import { Table } from '@tiptap/extension-table';
import TableRow from '@tiptap/extension-table-row';
import TableCell from '@tiptap/extension-table-cell';
import TableHeader from '@tiptap/extension-table-header';

const Reference = Node.create({
  name: 'cmsReference', group: 'block', atom: true,
  addAttributes() { return { html: { default: '' }, label: { default: 'Indhold fra administrationen' } }; },
  parseHTML() { return ['[data-cms-person]', '[data-cms-document]', '[data-cms-shared]', 'iframe', 'video'].map(tag => ({ tag, getAttrs: element => ({ html: element.outerHTML, label: element.hasAttribute('data-cms-person') ? 'Medarbejder · vedligeholdes under Medarbejdere' : element.hasAttribute('data-cms-document') ? 'Dokument · vedligeholdes under Dokumenter' : element.hasAttribute('data-cms-shared') ? 'Fælles oplysninger' : 'Indlejret video eller kalender' }) })); },
  renderHTML({ node }) { const div = document.createElement('div'); div.innerHTML = node.attrs.html; return div.firstElementChild || ['div']; },
  addNodeView() { return ({ node }) => { const dom = document.createElement('div'); dom.className = 'cms-chip'; dom.contentEditable = 'false'; dom.textContent = node.attrs.label; return { dom }; }; },
});
const PreservedImage = Image.extend({ addAttributes() { return { ...this.parent?.(), class: { default: 'content-image' }, loading: { default: 'lazy' } }; } });
const SingleParagraph = Node.create({
  name: 'doc', topNode: true, content: 'paragraph',
  addKeyboardShortcuts() { return { Enter: () => this.editor.commands.setHardBreak() }; },
});
window.OenskelandetEditor = {
  mount(element, html, onUpdate, { singleParagraph = false } = {}) {
    const extensions = singleParagraph
      ? [StarterKit.configure({ document: false, heading: false, blockquote: false, codeBlock: false, bulletList: false, orderedList: false, listItem: false, horizontalRule: false, trailingNode: false, link: { openOnClick: false } }), SingleParagraph]
      : [StarterKit.configure({ heading: { levels: [2, 3, 4] }, link: { openOnClick: false } }), PreservedImage, Table.configure({ resizable: false }), TableRow, TableCell, TableHeader, Reference];
    return new Editor({ element, extensions, content: html || '<p></p>', editorProps: { attributes: { class: 'block-rich-editor', role: 'textbox', 'aria-label': element.dataset.editorLabel || 'Tekstafsnit', 'aria-multiline': 'true' } }, onUpdate: ({ editor }) => onUpdate(editor.getHTML()) });
  },
};
