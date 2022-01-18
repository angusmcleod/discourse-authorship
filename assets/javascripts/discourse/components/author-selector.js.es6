import User from 'discourse/models/user';
import { default as discourseComputed } from 'discourse-common/utils/decorators';
import Component from '@ember/component';

export default Component.extend({
  classNames: 'author-selector',
  
  @discourseComputed('currentUser.author_list')
  authorList(userAuthorList) {
    return (userAuthorList || '').split(',').map(username => {
      return {
        id: username,
        name: username
      }
    });
  },
  
  actions: {
    updateAuthor(authorUsername) {
      if (authorUsername !== this.composer.user.username) {
        this.set('updatingAuthor', true);
        User.findByUsername(authorUsername)
          .then(user => {              
            this.set('composer.user', user);
            this.appEvents.trigger("author-selector:author-updated", user);
          }).finally(() => {
            this.set('updatingAuthor', false);
          });
      } else {
        this.appEvents.trigger("author-selector:author-updated", this.composer.user);
      }
    }
  }
})