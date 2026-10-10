import { expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import TimelineItem from '../components/remote/TimelineItem.vue'

it.each(['OPENED', 'COMMENT', 'COMMENTED', 'APPROVED', 'CHANGES_REQUESTED'])('keeps %s markers separate from card styling', kind => {
 const wrapper=mount(TimelineItem,{props:{kind},slots:{default:'<article class="comment">Comment body</article>'}})
 const marker=wrapper.get('.timeline-marker')
 expect(marker.classes()).not.toContain('comment')
 expect(wrapper.findAll('.comment')).toHaveLength(1)
 expect(wrapper.get('.comment').element.tagName).toBe('ARTICLE')
 expect(marker.attributes('aria-hidden')).toBe('true')
 wrapper.unmount()
})
