# frozen_string_literal: true

# name: discourse-authorship
# about: Authorship Plugin for Discourse
# version: 0.1.0
# author: Angus McLeod
# url: https://github.com/angusmcleod/discourse-authorship

register_asset 'stylesheets/common/common.scss'

after_initialize do
  %w(
    ../extensions/post_actions_controller.rb
  ).each do |path|
    load File.expand_path(path, __FILE__)
  end

  add_to_class(:user, :author_selection_enabled) do
    SiteSetting.author_selection_username === username
  end

  add_to_class(:user, :author_list) do
    if author_selection_enabled
      custom_fields['author_list'] || ''
    else
      ''
    end
  end

  class ::User
    attr_accessor :author_selected
  end

  ::PostActionsController.prepend PostActionsControllerAuthorshipExtension

  add_to_serializer(:current_user, :author_selection_enabled) { user.author_selection_enabled }
  add_to_serializer(:current_user, :author_list) { user.author_list }
  DiscoursePluginRegistry.serialized_current_user_fields << "author_list"
  register_editable_user_custom_field :author_list 
  add_permitted_post_create_param(:user_id, :string)

  add_to_class(:guardian, :can_delete_post_action?) do |post_action|
    return true if @user.author_selected && @user.respond_to?(:author_selected)
    return false unless is_my_own?(post_action) && !post_action.is_private_message?
    return true if post_action.is_bookmark?
    post_action.created_at > SiteSetting.post_undo_action_window_mins.minutes.ago
  end

  add_to_class(:posts_controller, :create) do
    @manager_params = create_params
    @manager_params[:first_post_checks] = !is_api?
    
    post_user = current_user
    
    if current_user.author_selection_enabled &&
       @manager_params[:user_id] &&
       (user = User.find(@manager_params[:user_id]))
      post_user = user
    end

    manager = NewPostManager.new(post_user, @manager_params)

    if is_api?
      memoized_payload = DistributedMemoizer.memoize(signature_for(@manager_params), 120) do
        result = manager.perform
        MultiJson.dump(serialize_data(result, NewPostResultSerializer, root: false))
      end

      parsed_payload = JSON.parse(memoized_payload)
      backwards_compatible_json(parsed_payload, parsed_payload['success'])
    else
      result = manager.perform
      json = serialize_data(result, NewPostResultSerializer, root: false)
      backwards_compatible_json(json, result.success?)
    end
  end

  if defined?(Presence) == 'constant' && Presence.class == Module
    add_to_class("Presence::PresencesController", :publish) do
      if current_user.blank? || current_user.user_option.hide_profile_and_presence?
        raise Discourse::NotFound 
      end

      data = params.permit(
        :response_needed,
        current: [:action, :topic_id, :post_id, :user_id],
        previous: [:action, :topic_id, :post_id, :user_id]
      )

      author_selection = current_user.author_selection_enabled

      payload = {}

      if data[:previous] &&
         data[:previous][:action].in?(Presence::PresencesController::ACTIONS) &&
         (!author_selection || data[:previous][:user_id])

        type = data[:previous][:post_id] ? 'post' : 'topic'
        id = data[:previous][:post_id] ? data[:previous][:post_id] : data[:previous][:topic_id]
        user_id = author_selection ? data[:previous][:user_id] : current_user.id
        topic = type == 'post' ? Post.find_by(id: id)&.topic : Topic.find_by(id: id)

        if topic
          guardian.ensure_can_see!(topic)

          Presence::PresenceManager.remove(type, id, user_id)
          Presence::PresenceManager.cleanup(type, id)
          Presence::PresenceManager.publish(type, id)
        end
      end

      if data[:current] &&
         data[:current][:action].in?(Presence::PresencesController::ACTIONS) &&
         (!author_selection || data[:current][:user_id])

        type = data[:current][:post_id] ? 'post' : 'topic'
        id = data[:current][:post_id] ? data[:current][:post_id] : data[:current][:topic_id]
        user_id = author_selection ? data[:current][:user_id] : current_user.id

        topic = type == 'post' ? Post.find_by(id: id)&.topic : Topic.find_by(id: id)

        if topic
          guardian.ensure_can_see!(topic)

          Presence::PresenceManager.add(type, id, user_id)
          Presence::PresenceManager.cleanup(type, id)
          users = Presence::PresenceManager.publish(type, id)

          if data[:response_needed]
            messagebus_channel = Presence::PresenceManager.get_messagebus_channel(type, id)
            users ||= Presence::PresenceManager.get_users(type, id)
            payload = json_payload(messagebus_channel, users)
          end
        end
      end

      render json: payload
    end
  end
end
