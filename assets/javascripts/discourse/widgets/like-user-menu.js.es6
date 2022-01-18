import { createWidget } from "discourse/widgets/widget";
import { h } from "virtual-dom";

const LIKE_ACTION = 2;

createWidget("like-user-menu", {
  tagName: "div.like-user-menu",
  buildKey: attrs => `like-user-menu-${attrs.id}`,

  defaultState(attrs) {
    return {
      likedUsers: null,
      updating: false
    }
  },

  html(attrs, state) {
    if (!state.likedUsers) {
      if (!state.updating) this.getWhoLiked();
      return h('div.spinner.small');
    }

    return h('ul', 
      this.authorList().map(
        username => {
          let hasLiked = state.likedUsers.indexOf(username) > -1;
          let action = hasLiked ? 'undo' : 'act';
          let icon = hasLiked ? 'times' : 'heart';
          
          return h('li',
            this.attach('link', {
              className: "like-user",
              action: "perform",
              actionParam: { username, action },
              rawLabel: username,
              icon
            })
          );
        }
      )
    );
  },

  authorList() {
    const { currentUser, attrs } = this;
    let list = currentUser.author_list ? currentUser.author_list.split(',') : [];
    return list.filter(username => (username !== attrs.username));
  },

  perform(params) {
    this.appEvents.on("page:like-by-user-complete", (post, likeAction) => {
      this.state.updating = false;
    });
    this.state.likedUsers = null;
    this.state.updating = true;
    this.scheduleRerender();
    this.sendWidgetAction('likeByUser', params);
  },

  getWhoLiked() {
    const { attrs, state } = this;

    return this.store
      .find("post-action-user", {
        id: attrs.id,
        post_action_type_id: LIKE_ACTION
      })
      .then(users => {
        state.likedUsers = users.map(u => u.username);
        this.scheduleRerender();
      });
  },

  clickOutside(e) {
    this.sendWidgetAction("toggleLikeUserMenu", true);
  }
});
