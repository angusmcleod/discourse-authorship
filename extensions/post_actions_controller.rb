# frozen_string_literal: true

module PostActionsControllerAuthorshipExtension
  def create
    if like_author
      raise Discourse::NotFound if @post.blank?
      
      creator = PostActionCreator.new(like_author, @post, @post_action_type_id)
      result = creator.perform

      if result.failed?
        render_json_error(result)
      else
        @post.reload
        render_post_json(@post, add_raw: false)
      end
    else
      super
    end
  end

  def destroy
    if like_author
      destroyer = PostActionDestroyer.new(
        like_author,
        Post.find_by(id: params[:id].to_i),
        @post_action_type_id
      )

      like_author.author_selected = true

      result = destroyer.perform

      if result.failed?
        render_json_error(result)
      else
        render_post_json(result.post, add_raw: false)
      end
    else
      super
    end
  end

  def like_author
    @like_author ||= begin
      current_user.author_selection_enabled &&
      params[:like_username] &&
      User.find_by(username: params[:like_username])
    end
  end
end
