import Composer from 'discourse/models/composer';
import { likeButtonAttrs, likeCountButtonAttrs } from '../lib/utilities';
import { default as discourseComputed, on } from 'discourse-common/utils/decorators';
import { withPluginApi } from 'discourse/lib/plugin-api';
import { h } from 'virtual-dom';
import { ajax } from "discourse/lib/ajax";
import { popupAjaxError } from 'discourse/lib/ajax-error';

export default {
  name: 'authorship-initializer',
  initialize(container) {
    const currentUser = container.lookup('current-user:main');
    Composer.serializeOnCreate('user_id', 'user.id');

    withPluginApi('0.8.37', api => {          
      api.reopenWidget('post-menu', {
        defaultState(attrs) {
          let state = this._super();
          state['showLikeUserMenu'] = false;
          state['likeMenuEnabled'] = currentUser && currentUser.author_selection_enabled;
          return state;
        },

        toggleLikeUserMenu(forceClose) {
          this.state.showLikeUserMenu = forceClose ? false : !this.state.showLikeUserMenu;
        },

        attachLikeButton(name) {
          const { attrs, settings } = this;
          let contents = [
            this.attach(
              settings.buttonType,
              likeButtonAttrs(attrs)
            )
          ]

          if (attrs.likeCount > 0) {
            contents.unshift(
              this.attach(
                settings.buttonType,
                likeCountButtonAttrs(attrs)
              )
            )
          }

          return h("div.double-button", contents);
        },

        attachButton(name) {
          if (this.state.likeMenuEnabled && name === 'like') {
            return this.attachLikeButton(name);
          } else {
            return this._super(name);
          }
        },

        like() {
          const { attrs, state } = this;
          if (state.likeMenuEnabled) {
            if (state.likedUsers.length) {
              state.likedUsers = [];
              this.scheduleRerender();  
            } else {
              return this.toggleLikeUserMenu();
            }
          } else {
            return this._super();
          }
        },

        html(attrs, state) {
          let contents = this._super(attrs, state);
          if (state.showLikeUserMenu) {
            attrs.likedUsers = state.likedUsers;
            contents.forEach(w => {
              if (w.properties &&
                  w.properties.className.indexOf('post-controls') > -1) {
                w.children.forEach(w => {
                  if (w.properties &&
                      w.properties.className.indexOf("actions") > -1 &&
                      !$.grep(w.children, (w) => (w.key === `like-user-menu-${attrs.id}`)).length) {
                    w.children.push(this.attach('like-user-menu', attrs));
                  }
                })
              }
            });
          }
          return contents;
        }
      });

      api.reopenWidget('post', {
        likeByUser(opts) {
          const post = this.model;
          const likeAction = post.get("likeAction");

          post.set('like_username', opts.username);
          post.set('like_action', opts.action);

          if (likeAction) {
            return likeAction.togglePromise(post).then(result => {
              this.appEvents.trigger("page:like-by-user-complete", post, likeAction);
              return this._warnIfClose(result);
            });
          }
        }
      });

      api.includePostAttributes('topic', 'actions_summary');

      api.addPostTransformCallback((p) => {
        if (p.topic &&
            currentUser &&
            currentUser.author_selection_enabled) {
          p.showLike = true;
          p.canToggleLike = true;
        }
      });

      api.modifyClass('model:action-summary', {
        togglePromise(post) {
          if (post.like_action) {
            return post.like_action === 'act' ? this.act(post) : this.undo(post);
          } else {
            return this._super(post);
          }
        },

        act(post, opts) {
          if (!opts) opts = {};
          
          if (post.like_username) {
            this.setProperties({
              count: this.count + 1,
              can_undo: true
            });

            return ajax("/post_actions", {
              type: "POST",
              data: {
                id: this.flagTopic ? this.get("flagTopic.id") : post.get("id"),
                post_action_type_id: this.id,
                message: opts.message,
                is_warning: opts.isWarning,
                take_action: opts.takeAction,
                flag_topic: this.flagTopic ? true : false,
                like_username: post.like_username
              },
              returnXHR: true
            })
              .then(data => {
                if (!this.flagTopic) {
                  post.updateActionsSummary(data.result);
                }
                return {};
              })
              .catch(error => {
                popupAjaxError(error);
                this.removeAction(post);
              });
          } else {
            return this._super(post, opts);
          }
        },

        undo(post) {
          if (post.like_username) {
            this.removeAction(post);

            return ajax("/post_actions/" + post.get("id"), {
              type: "DELETE",
              data: {
                post_action_type_id: this.id,
                like_username: post.like_username
              }
            }).then(result => {
              post.updateActionsSummary(result);
              return {};
            });
          } else {
            return this._super(post);
          }
        }
      });

      api.modifyClass('component:composer-presence-display', {
        @on("didInsertElement")
        userChanged() {
          this.appEvents.on("author-selector:author-updated", (user) => {
            this.updateState(user);
          });
        },
        
        updateState(user) {
          let state = null;
          const action = this.action;
          const currentUser = this.currentUser;

          if (action === "reply" || action === "edit") {
            state = { action };
            if (action === "reply") state.topic_id = this.get("topic.id");
            if (action === "edit") state.post_id = this.get("post.id");
            if (currentUser.author_selection_enabled) {
              if (!user) return;
              state.user_id = user.id;
            }
          }

          this.set("previousState", this.currentState);
          this.set("currentState", state);
        }
      });

      api.modifyClass('controller:preferences/interface', {
        @discourseComputed('makeThemeDefault')
        saveAttrNames() {
          const attrs = this._super(...arguments);
          if (!attrs.includes("custom_fields")) attrs.push("custom_fields");
          return attrs;
        }
      });
    });
  }
}
