<script setup>
import { ref, watch, onBeforeUnmount, computed } from 'vue'
import { useEditor, EditorContent } from '@tiptap/vue-3'
import StarterKit from '@tiptap/starter-kit'
import Underline from '@tiptap/extension-underline'
import TextAlign from '@tiptap/extension-text-align'
import TextStyle from '@tiptap/extension-text-style'
import Color from '@tiptap/extension-color'
import Highlight from '@tiptap/extension-highlight'
import FontFamily from '@tiptap/extension-font-family'
import Table from '@tiptap/extension-table'
import TableRow from '@tiptap/extension-table-row'
import TableCell from '@tiptap/extension-table-cell'
import TableHeader from '@tiptap/extension-table-header'
import Image from '@tiptap/extension-image'
import Placeholder from '@tiptap/extension-placeholder'
import Typography from '@tiptap/extension-typography'

const props = defineProps({
  modelValue: { type: String, default: '' },
  placeholder: { type: String, default: 'Commencez à rédiger votre document...' }
})

const emit = defineEmits(['update:modelValue'])

const showTableMenu = ref(false)
const showColorPicker = ref(false)
const showHighlightPicker = ref(false)
const showFontMenu = ref(false)
const showInsertMenu = ref(false)

const colorOptions = [
  '#000000', '#1e293b', '#374151', '#64748b',
  '#dc2626', '#ea580c', '#f59e0b', '#16a34a',
  '#0284c7', '#4f46e5', '#7c3aed', '#db2777'
]

const highlightOptions = [
  { label: 'Jaune', color: '#fef08a' },
  { label: 'Vert', color: '#bbf7d0' },
  { label: 'Bleu', color: '#bfdbfe' },
  { label: 'Rose', color: '#fecdd3' },
  { label: 'Violet', color: '#ddd6fe' },
  { label: 'Orange', color: '#fed7aa' }
]

const fontOptions = [
  { label: 'Défaut (Serif)', value: 'Georgia, serif' },
  { label: 'Arial', value: 'Arial, sans-serif' },
  { label: 'Times New Roman', value: 'Times New Roman, serif' },
  { label: 'Courier New', value: 'Courier New, monospace' },
  { label: 'Verdana', value: 'Verdana, sans-serif' },
  { label: 'Trebuchet MS', value: 'Trebuchet MS, sans-serif' },
  { label: 'Tahoma', value: 'Tahoma, sans-serif' },
  { label: 'Impact', value: 'Impact, sans-serif' }
]

// Le texte collé depuis Word porte des styles de fond et de couleur qui
// n'existent que dans Word (fond blanc « surligné », texte gris de
// placeholder) : collés tels quels, ils s'affichent comme des blocs et du
// texte délavés dans l'éditeur. On les retire, mais uniquement sur ce qui
// vient d'être collé — jamais sur le contenu déjà enregistré par
// l'utilisateur, dont la mise en forme (couleur, surlignage) est volontaire.
const nettoyerStylesColles = (html) => {
  const conteneur = document.createElement('div')
  conteneur.innerHTML = html
  conteneur.querySelectorAll('[style]').forEach((el) => {
    el.style.removeProperty('background-color')
    el.style.removeProperty('background')
    el.style.removeProperty('color')
  })
  return conteneur.innerHTML
}

const editor = useEditor({
  content: props.modelValue || '',
  extensions: [
    StarterKit.configure({
      heading: { levels: [1, 2, 3] },
      bulletList: { keepMarks: true },
      orderedList: { keepMarks: true },
    }),
    Underline,
    TextAlign.configure({
      types: ['heading', 'paragraph'],
    }),
    TextStyle,
    Color,
    Highlight.configure({
      multicolor: true,
    }),
    FontFamily.configure({
      types: ['textStyle'],
    }),
    Table.configure({
      resizable: true,
    }),
    TableRow,
    TableCell,
    TableHeader,
    Image.configure({
      inline: true,
    }),
    Placeholder.configure({
      placeholder: props.placeholder,
    }),
    Typography,
  ],
  editorProps: {
    attributes: {
      class: 'rich-doc-content',
    },
    // Dépose d'une variable glissée depuis la liste (DocumentsGenerator.vue) :
    // on insère le texte brut ({{cle}}) exactement à l'endroit du curseur de
    // dépose, sans passer par le presse-papiers. `moved` distingue ça d'un
    // déplacement de texte interne à l'éditeur, que TipTap doit gérer lui-même.
    handleDrop: (view, event, slice, moved) => {
      if (moved) return false
      const texte = event.dataTransfer?.getData('text/plain')
      if (!texte || !texte.trim()) return false
      const coords = view.posAtCoords({ left: event.clientX, top: event.clientY })
      if (!coords) return false
      event.preventDefault()
      view.dispatch(view.state.tr.insertText(texte, coords.pos))
      return true
    },
    transformPastedHTML: nettoyerStylesColles,
  },
  onUpdate: ({ editor }) => {
    emit('update:modelValue', editor.getHTML())
  },
})

watch(() => props.modelValue, (newVal) => {
  if (editor.value && editor.value.getHTML() !== newVal) {
    editor.value.commands.setContent(newVal || '', false)
  }
})

onBeforeUnmount(() => {
  if (editor.value) {
    editor.value.destroy()
  }
})

const insertTable = () => {
  if (editor.value) {
    editor.value.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()
  }
  showTableMenu.value = false
  showInsertMenu.value = false
}

const addImageUrl = () => {
  const url = prompt('URL de l\'image :')
  if (url && editor.value) {
    editor.value.chain().focus().setImage({ src: url }).run()
  }
  showInsertMenu.value = false
}

const imageInput = ref(null)

const triggerImageUpload = () => {
  if (imageInput.value) imageInput.value.click()
  showInsertMenu.value = false
}

const handleImageUpload = (event) => {
  const file = event.target.files[0]
  if (!file || !editor.value) return
  
  // Vérifier la taille (max 5 Mo)
  if (file.size > 5 * 1024 * 1024) {
    alert('Image trop lourde (max 5 Mo).')
    return
  }
  
  const reader = new FileReader()
  reader.onload = (e) => {
    editor.value.chain().focus().setImage({ src: e.target.result }).run()
  }
  reader.readAsDataURL(file)
  
  // Reset input pour permettre de ré-uploader le même fichier
  event.target.value = ''
}

const insertHr = () => {
  if (editor.value) {
    editor.value.chain().focus().setHorizontalRule().run()
  }
  showInsertMenu.value = false
}

const currentHeadingLevel = computed(() => {
  if (!editor.value) return 0
  for (let i = 1; i <= 3; i++) {
    if (editor.value.isActive('heading', { level: i })) return i
  }
  return 0
})

const headingLabel = computed(() => {
  if (currentHeadingLevel.value === 1) return 'Titre 1'
  if (currentHeadingLevel.value === 2) return 'Titre 2'
  if (currentHeadingLevel.value === 3) return 'Titre 3'
  return 'Paragraphe'
})

const closeMenus = () => {
  showTableMenu.value = false
  showColorPicker.value = false
  showHighlightPicker.value = false
  showFontMenu.value = false
  showInsertMenu.value = false
}

const wordCount = computed(() => {
  if (!editor.value) return 0
  return editor.value.storage.characterCount?.words?.() || 
    editor.value.getText().split(/\s+/).filter(Boolean).length
})

const charCount = computed(() => {
  if (!editor.value) return 0
  return editor.value.getText().length
})
</script>

<template>
  <div class="rich-editor-wrapper" @click="closeMenus">
    <!-- ════ BARRE DE MENUS (Google Docs style) ════ -->
    <div class="rich-menu-bar">
      <div class="menu-group">
        <!-- FICHIER -->
        <div class="menu-item-container" style="position: relative;">
          <button class="menu-trigger" @click.stop="showInsertMenu = !showInsertMenu">Insertion</button>
          <div v-if="showInsertMenu" class="menu-dropdown" @click.stop>
            <button class="menu-dropdown-item" @click="triggerImageUpload">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
              Image depuis l'ordinateur
            </button>
            <button class="menu-dropdown-item" @click="addImageUrl">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
              Image depuis une URL
            </button>
            <div style="height: 1px; background: #e8eaed; margin: 0.25rem 0;"></div>
            <button class="menu-dropdown-item" @click="insertTable">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="3" y1="15" x2="21" y2="15"/><line x1="9" y1="3" x2="9" y2="21"/><line x1="15" y1="3" x2="15" y2="21"/></svg>
              Tableau (3×3)
            </button>
            <button class="menu-dropdown-item" @click="insertHr">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="5" y1="12" x2="19" y2="12"/></svg>
              Ligne horizontale
            </button>
          </div>
          <!-- Input fichier caché pour l'upload d'images -->
          <input ref="imageInput" type="file" accept="image/*" style="display: none;" @change="handleImageUpload" />
        </div>
      </div>
    </div>

    <!-- ════ BARRE D'OUTILS PRINCIPALE ════ -->
    <div class="rich-toolbar">
      <!-- Annuler / Refaire -->
      <button class="tb-btn" @click="editor?.chain().focus().undo().run()" :disabled="!editor?.can().undo()" title="Annuler (Ctrl+Z)">
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg>
      </button>
      <button class="tb-btn" @click="editor?.chain().focus().redo().run()" :disabled="!editor?.can().redo()" title="Rétablir (Ctrl+Y)">
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
      </button>

      <div class="tb-sep"></div>

      <!-- Style de paragraphe -->
      <div class="tb-dropdown-wrap" style="position: relative;">
        <button class="tb-btn tb-dropdown-btn" @click.stop="showFontMenu = false" style="min-width: 100px;">
          <select class="tb-select" @change="
            const v = $event.target.value;
            if (v === '0') editor?.chain().focus().setParagraph().run();
            else editor?.chain().focus().toggleHeading({ level: parseInt(v) }).run();
          ">
            <option value="0" :selected="currentHeadingLevel === 0">Paragraphe</option>
            <option value="1" :selected="currentHeadingLevel === 1">Titre 1</option>
            <option value="2" :selected="currentHeadingLevel === 2">Titre 2</option>
            <option value="3" :selected="currentHeadingLevel === 3">Titre 3</option>
          </select>
        </button>
      </div>

      <!-- Police -->
      <div style="position: relative;">
        <button class="tb-btn tb-dropdown-btn" @click.stop="showFontMenu = !showFontMenu" style="min-width: 90px; font-size: 0.75rem;">
          Police ▾
        </button>
        <div v-if="showFontMenu" class="menu-dropdown" style="min-width: 200px; top: 100%; left: 0;" @click.stop>
          <button v-for="f in fontOptions" :key="f.value" class="menu-dropdown-item" :style="{ fontFamily: f.value }" @click="editor?.chain().focus().setFontFamily(f.value).run(); showFontMenu = false">
            {{ f.label }}
          </button>
        </div>
      </div>

      <div class="tb-sep"></div>

      <!-- Gras / Italique / Souligné / Barré -->
      <button class="tb-btn" :class="{ active: editor?.isActive('bold') }" @click="editor?.chain().focus().toggleBold().run()" title="Gras (Ctrl+B)">
        <strong>B</strong>
      </button>
      <button class="tb-btn" :class="{ active: editor?.isActive('italic') }" @click="editor?.chain().focus().toggleItalic().run()" title="Italique (Ctrl+I)">
        <em>I</em>
      </button>
      <button class="tb-btn" :class="{ active: editor?.isActive('underline') }" @click="editor?.chain().focus().toggleUnderline().run()" title="Souligné (Ctrl+U)">
        <u>U</u>
      </button>
      <button class="tb-btn" :class="{ active: editor?.isActive('strike') }" @click="editor?.chain().focus().toggleStrike().run()" title="Barré">
        <s>S</s>
      </button>

      <!-- Couleur du texte -->
      <div style="position: relative;">
        <button class="tb-btn" @click.stop="showColorPicker = !showColorPicker; showHighlightPicker = false" title="Couleur du texte">
          <span style="font-weight: 800; font-size: 0.85rem;">A</span>
          <span style="display:block; width: 14px; height: 3px; background: #dc2626; border-radius: 2px; margin-top: 1px;"></span>
        </button>
        <div v-if="showColorPicker" class="color-picker-popup" @click.stop>
          <div class="color-grid">
            <button v-for="c in colorOptions" :key="c" class="color-swatch" :style="{ background: c }" @click="editor?.chain().focus().setColor(c).run(); showColorPicker = false" :title="c"></button>
          </div>
          <button class="color-reset" @click="editor?.chain().focus().unsetColor().run(); showColorPicker = false">Réinitialiser</button>
        </div>
      </div>

      <!-- Surlignage -->
      <div style="position: relative;">
        <button class="tb-btn" @click.stop="showHighlightPicker = !showHighlightPicker; showColorPicker = false" title="Surlignage">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
        </button>
        <div v-if="showHighlightPicker" class="color-picker-popup" @click.stop>
          <div class="color-grid">
            <button v-for="h in highlightOptions" :key="h.color" class="color-swatch" :style="{ background: h.color }" @click="editor?.chain().focus().toggleHighlight({ color: h.color }).run(); showHighlightPicker = false" :title="h.label"></button>
          </div>
          <button class="color-reset" @click="editor?.chain().focus().unsetHighlight().run(); showHighlightPicker = false">Retirer</button>
        </div>
      </div>

      <div class="tb-sep"></div>

      <!-- Alignement -->
      <button class="tb-btn" :class="{ active: editor?.isActive({ textAlign: 'left' }) }" @click="editor?.chain().focus().setTextAlign('left').run()" title="Aligner à gauche">
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="15" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
      </button>
      <button class="tb-btn" :class="{ active: editor?.isActive({ textAlign: 'center' }) }" @click="editor?.chain().focus().setTextAlign('center').run()" title="Centrer">
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="3" y1="6" x2="21" y2="6"/><line x1="7" y1="12" x2="17" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
      </button>
      <button class="tb-btn" :class="{ active: editor?.isActive({ textAlign: 'right' }) }" @click="editor?.chain().focus().setTextAlign('right').run()" title="Aligner à droite">
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="3" y1="6" x2="21" y2="6"/><line x1="9" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
      </button>
      <button class="tb-btn" :class="{ active: editor?.isActive({ textAlign: 'justify' }) }" @click="editor?.chain().focus().setTextAlign('justify').run()" title="Justifier">
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
      </button>

      <div class="tb-sep"></div>

      <!-- Listes -->
      <button class="tb-btn" :class="{ active: editor?.isActive('bulletList') }" @click="editor?.chain().focus().toggleBulletList().run()" title="Liste à puces">
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><circle cx="4" cy="6" r="1" fill="currentColor"/><circle cx="4" cy="12" r="1" fill="currentColor"/><circle cx="4" cy="18" r="1" fill="currentColor"/></svg>
      </button>
      <button class="tb-btn" :class="{ active: editor?.isActive('orderedList') }" @click="editor?.chain().focus().toggleOrderedList().run()" title="Liste numérotée">
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="10" y1="6" x2="21" y2="6"/><line x1="10" y1="12" x2="21" y2="12"/><line x1="10" y1="18" x2="21" y2="18"/><path d="M4 6h1v4"/><path d="M4 10h2"/><path d="M6 18H4c0-1 2-2 2-3s-1-1.5-2-1"/></svg>
      </button>

      <!-- Indentation -->
      <button class="tb-btn" @click="editor?.chain().focus().sinkListItem('listItem').run()" :disabled="!editor?.can().sinkListItem('listItem')" title="Augmenter le retrait">
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>
      </button>
      <button class="tb-btn" @click="editor?.chain().focus().liftListItem('listItem').run()" :disabled="!editor?.can().liftListItem('listItem')" title="Diminuer le retrait">
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"/></svg>
      </button>

      <div class="tb-sep"></div>

      <!-- Citation -->
      <button class="tb-btn" :class="{ active: editor?.isActive('blockquote') }" @click="editor?.chain().focus().toggleBlockquote().run()" title="Citation">
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 17h3l2-4V7H5v6h3l-2 4zm8 0h3l2-4V7h-6v6h3l-2 4z"/></svg>
      </button>

      <!-- Code bloc -->
      <button class="tb-btn" :class="{ active: editor?.isActive('codeBlock') }" @click="editor?.chain().focus().toggleCodeBlock().run()" title="Bloc de code">
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>
      </button>

      <!-- Effacer le formatage -->
      <button class="tb-btn" @click="editor?.chain().focus().unsetAllMarks().clearNodes().run()" title="Effacer le formatage">
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 7V4h16v3"/><path d="M9 20h6"/><path d="M12 4v16"/></svg>
      </button>
    </div>

    <!-- ════ ZONE D'ÉDITION (feuille A4) ════ -->
    <div class="rich-editor-body">
      <div class="a4-page">
        <EditorContent :editor="editor" />
      </div>
    </div>

    <!-- ════ BARRE DE STATUT ════ -->
    <div class="rich-status-bar">
      <span>{{ wordCount }} mots</span>
      <span>{{ charCount }} caractères</span>
    </div>
  </div>
</template>

<style scoped>
.rich-editor-wrapper {
  display: flex;
  flex-direction: column;
  background: #f1f3f4;
  border-radius: 8px;
  overflow: hidden;
  border: 1px solid #dadce0;
  height: 75vh;
  min-height: 500px;
}

/* ═══ BARRE DE MENUS ═══ */
.rich-menu-bar {
  display: flex;
  align-items: center;
  padding: 0.2rem 0.5rem;
  background: #ffffff;
  border-bottom: 1px solid #e8eaed;
  gap: 0.25rem;
}
.menu-group {
  display: flex;
  gap: 0;
}
.menu-trigger {
  background: none;
  border: none;
  padding: 0.3rem 0.6rem;
  border-radius: 4px;
  font-size: 0.8rem;
  color: #3c4043;
  cursor: pointer;
  font-weight: 500;
}
.menu-trigger:hover {
  background: #e8eaed;
}
.menu-dropdown {
  position: absolute;
  top: 100%;
  left: 0;
  background: white;
  border: 1px solid #dadce0;
  border-radius: 8px;
  box-shadow: 0 8px 30px rgba(0,0,0,0.12);
  z-index: 100;
  padding: 0.25rem 0;
  min-width: 180px;
}
.menu-dropdown-item {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  width: 100%;
  padding: 0.5rem 1rem;
  background: none;
  border: none;
  font-size: 0.82rem;
  color: #3c4043;
  cursor: pointer;
  text-align: left;
}
.menu-dropdown-item:hover {
  background: #e8eaed;
}

/* ═══ BARRE D'OUTILS ═══ */
.rich-toolbar {
  display: flex;
  align-items: center;
  padding: 0.3rem 0.5rem;
  background: #edf2fa;
  border-bottom: 1px solid #dadce0;
  gap: 0.15rem;
  flex-wrap: wrap;
  border-radius: 99px;
  margin: 0.35rem 0.5rem;
}

.tb-btn {
  background: none;
  border: none;
  padding: 0.35rem;
  border-radius: 4px;
  cursor: pointer;
  color: #444746;
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 28px;
  height: 28px;
  font-size: 0.85rem;
  transition: background 0.15s;
}
.tb-btn:hover:not(:disabled) {
  background: #d3e3fd;
}
.tb-btn.active {
  background: #c2e0ff;
  color: #1a73e8;
}
.tb-btn:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}

.tb-sep {
  width: 1px;
  height: 20px;
  background: #c4c7c5;
  margin: 0 0.35rem;
}

.tb-select {
  background: none;
  border: none;
  font-size: 0.78rem;
  color: #3c4043;
  cursor: pointer;
  padding: 0.15rem 0.25rem;
  outline: none;
  font-weight: 500;
}

.tb-dropdown-btn {
  font-size: 0.78rem;
  padding: 0.2rem 0.5rem;
}

/* ═══ COLOR PICKER ═══ */
.color-picker-popup {
  position: absolute;
  top: 100%;
  left: -20px;
  background: white;
  border: 1px solid #dadce0;
  border-radius: 8px;
  box-shadow: 0 8px 30px rgba(0,0,0,0.12);
  z-index: 100;
  padding: 0.75rem;
  min-width: 160px;
}
.color-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 0.35rem;
}
.color-swatch {
  width: 28px;
  height: 28px;
  border: 2px solid transparent;
  border-radius: 50%;
  cursor: pointer;
  transition: all 0.15s;
}
.color-swatch:hover {
  transform: scale(1.15);
  border-color: #1a73e8;
}
.color-reset {
  display: block;
  width: 100%;
  margin-top: 0.5rem;
  padding: 0.3rem;
  background: #f8f9fa;
  border: 1px solid #dadce0;
  border-radius: 4px;
  font-size: 0.72rem;
  color: #5f6368;
  cursor: pointer;
  text-align: center;
}
.color-reset:hover {
  background: #e8eaed;
}

/* ═══ ZONE D'ÉDITION (A4 centrée) ═══ */
.rich-editor-body {
  flex: 1;
  overflow-y: auto;
  background: #f1f3f4;
  padding: 2rem;
  display: flex;
  justify-content: center;
}

.a4-page {
  background: white;
  width: 210mm;
  max-width: 100%;
  min-height: 297mm;
  box-shadow: 0 2px 10px rgba(0,0,0,0.08);
  border-radius: 0;
  padding: 25mm 20mm;
  font-family: Georgia, serif;
  font-size: 11pt;
  line-height: 1.6;
  color: #1f1f1f;
}

/* TipTap Content Styling */
.a4-page :deep(.rich-doc-content) {
  outline: none;
  min-height: 200mm;
}

.a4-page :deep(.rich-doc-content) > * + * {
  margin-top: 0.75em;
}

.a4-page :deep(h1) {
  font-size: 2rem;
  font-weight: 700;
  margin: 1.25rem 0 0.75rem;
  color: #1a1a1a;
  line-height: 1.3;
}

.a4-page :deep(h2) {
  font-size: 1.5rem;
  font-weight: 700;
  margin: 1rem 0 0.5rem;
  color: #1a1a1a;
  line-height: 1.3;
}

.a4-page :deep(h3) {
  font-size: 1.2rem;
  font-weight: 600;
  margin: 0.75rem 0 0.5rem;
  color: #1a1a1a;
  line-height: 1.3;
}

.a4-page :deep(p) {
  margin: 0.5em 0;
}

.a4-page :deep(blockquote) {
  border-left: 4px solid #d0d5dd;
  padding: 0.5rem 1rem;
  color: #475467;
  margin: 1rem 0;
  background: #f9fafb;
  font-style: italic;
}

.a4-page :deep(pre) {
  background: #1e1e1e;
  color: #d4d4d4;
  font-family: 'Courier New', monospace;
  padding: 1rem;
  border-radius: 6px;
  overflow-x: auto;
  font-size: 0.85em;
}

.a4-page :deep(code) {
  background: #f2f4f7;
  padding: 0.1em 0.3em;
  border-radius: 3px;
  font-size: 0.9em;
  font-family: 'Courier New', monospace;
}

.a4-page :deep(ul) {
  padding-left: 1.5em;
  margin: 0.5em 0;
}

.a4-page :deep(ol) {
  padding-left: 1.5em;
  margin: 0.5em 0;
}

.a4-page :deep(li) {
  margin: 0.25em 0;
}

.a4-page :deep(li p) {
  margin: 0;
}

.a4-page :deep(hr) {
  border: none;
  border-top: 1px solid #d0d5dd;
  margin: 1.5rem 0;
}

.a4-page :deep(table) {
  border-collapse: collapse;
  width: 100%;
  margin: 1rem 0;
  table-layout: fixed;
}

.a4-page :deep(th),
.a4-page :deep(td) {
  border: 1px solid #d0d5dd;
  padding: 0.5rem 0.75rem;
  text-align: left;
  vertical-align: top;
  font-size: 0.9em;
}

.a4-page :deep(th) {
  background: #f2f4f7;
  font-weight: 700;
}

.a4-page :deep(img) {
  max-width: 100%;
  height: auto;
  border-radius: 4px;
}

/* Placeholder */
.a4-page :deep(.is-editor-empty:first-child::before) {
  content: attr(data-placeholder);
  float: left;
  color: #adb5bd;
  pointer-events: none;
  height: 0;
  font-style: italic;
}

/* ═══ BARRE DE STATUT ═══ */
.rich-status-bar {
  display: flex;
  align-items: center;
  gap: 1.5rem;
  padding: 0.35rem 1rem;
  background: #f8f9fa;
  border-top: 1px solid #dadce0;
  font-size: 0.72rem;
  color: #5f6368;
}
</style>
