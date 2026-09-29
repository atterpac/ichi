export const toastDesigns = [
  { id: 'dock', name: 'Command dock', note: 'A wide bar above the bottom edge. Status on the left, action on the right.', placement: 'Bottom center' },
  { id: 'card', name: 'Quiet card', note: 'Rounded charcoal surface, clear text and simple actions. No leading icons.', placement: 'Bottom right' },
  { id: 'capsule', name: 'Signal capsule', note: 'A floating status light with the message hanging beneath a rounded header.', placement: 'Top center' },
  { id: 'bulletin', name: 'Bulletin', note: 'An open editorial layout: oversized status word, fine rules, no enclosing card.', placement: 'Top right' },
] as const
export type ToastStyle = typeof toastDesigns[number]['id']
