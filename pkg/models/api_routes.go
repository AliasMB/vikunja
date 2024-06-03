// Vikunja is a to-do list application to facilitate your life.
// Copyright 2018-present Vikunja and contributors. All rights reserved.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public Licensee as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU Affero General Public Licensee for more details.
//
// You should have received a copy of the GNU Affero General Public Licensee
// along with this program.  If not, see <https://www.gnu.org/licenses/>.

package models

import (
	"net/http"
	"reflect"
	"runtime"
	"strings"

	"code.vikunja.io/api/pkg/log"

	"github.com/labstack/echo/v4"
)

var apiTokenRoutes = map[string]APITokenRoute{}

func init() {
	apiTokenRoutes = make(map[string]APITokenRoute)
}

type APITokenRoute map[string]*RouteDetail

type RouteDetail struct {
	Path   string `json:"path"`
	Method string `json:"method"`
}

func getRouteGroupName(path string) (finalName string, filteredParts []string) {
	parts := strings.Split(strings.TrimPrefix(path, "/api/v1/"), "/")
	filteredParts = []string{}
	for _, part := range parts {
		if strings.HasPrefix(part, ":") {
			continue
		}

		filteredParts = append(filteredParts, part)
	}

	finalName = strings.Join(filteredParts, "_")
	switch finalName {
	case "projects_tasks":
		fallthrough
	case "tasks_all":
		return "tasks", []string{"tasks"}
	default:
		return finalName, filteredParts
	}
}

// CollectRoutesForAPITokenUsage gets called for every added APITokenRoute and builds a list of all routes we can use for the api tokens.
func CollectRoutesForAPITokenUsage(route echo.Route, middlewares []echo.MiddlewareFunc) {

	if route.Method == "echo_route_not_found" {
		return
	}

	seenJWT := false
	for _, middleware := range middlewares {
		if strings.Contains(runtime.FuncForPC(reflect.ValueOf(middleware).Pointer()).Name(), "github.com/labstack/echo-jwt/") {
			seenJWT = true
		}
	}

	if !seenJWT {
		return
	}

	routeGroupName, routeParts := getRouteGroupName(route.Path)

	if routeGroupName == "user" ||
		routeGroupName == "tokenTest" ||
		routeGroupName == "subscriptions" ||
		routeGroupName == "tokens" ||
		routeGroupName == "*" ||
		strings.HasPrefix(routeGroupName, "user_") ||
		strings.HasSuffix(routeGroupName, "_bulk") {
		return
	}

	if !strings.Contains(route.Name, "(*WebHandler)") && !strings.Contains(route.Name, "Attachment") {
		routeDetail := &RouteDetail{
			Path:   route.Path,
			Method: route.Method,
		}
		// We're trying to add routes to the routes of a matching "parent" - for
		// example, projects_background should show up under "projects".
		// To do this, we check if the route is a sub route of some other route
		// and if that's the case, add it to its parent instead.
		// Otherwise, we add it to the "other" key.
		if len(routeParts) == 1 {
			if _, has := apiTokenRoutes["other"]; !has {
				apiTokenRoutes["other"] = make(APITokenRoute)
			}

			_, exists := apiTokenRoutes["other"][routeGroupName]
			if exists {
				routeGroupName += "_" + strings.ToLower(route.Method)
			}
			apiTokenRoutes["other"][routeGroupName] = routeDetail
			return
		}

		subkey := strings.Join(routeParts[1:], "_")

		if _, has := apiTokenRoutes[routeParts[0]]; !has {
			apiTokenRoutes[routeParts[0]] = make(APITokenRoute)
		}

		if _, has := apiTokenRoutes[routeParts[0]][subkey]; has {
			subkey += "_" + strings.ToLower(route.Method)
		}

		apiTokenRoutes[routeParts[0]][subkey] = routeDetail

		return
	}

	_, has := apiTokenRoutes[routeGroupName]
	if !has {
		apiTokenRoutes[routeGroupName] = make(APITokenRoute)
	}

	if strings.Contains(route.Name, "CreateWeb") {
		apiTokenRoutes[routeGroupName]["create"] = &RouteDetail{
			Path:   route.Path,
			Method: route.Method,
		}
	}
	if strings.Contains(route.Name, "ReadOneWeb") {
		apiTokenRoutes[routeGroupName]["read_one"] = &RouteDetail{
			Path:   route.Path,
			Method: route.Method,
		}
	}
	if strings.Contains(route.Name, "ReadAllWeb") {
		apiTokenRoutes[routeGroupName]["read_all"] = &RouteDetail{
			Path:   route.Path,
			Method: route.Method,
		}
	}
	if strings.Contains(route.Name, "UpdateWeb") {
		apiTokenRoutes[routeGroupName]["update"] = &RouteDetail{
			Path:   route.Path,
			Method: route.Method,
		}
	}
	if strings.Contains(route.Name, "DeleteWeb") {
		apiTokenRoutes[routeGroupName]["delete"] = &RouteDetail{
			Path:   route.Path,
			Method: route.Method,
		}
	}

	if routeGroupName == "tasks_attachments" {
		if strings.Contains(route.Name, "UploadTaskAttachment") {
			apiTokenRoutes[routeGroupName]["create"] = &RouteDetail{
				Path:   route.Path,
				Method: route.Method,
			}
		}
		if strings.Contains(route.Name, "GetTaskAttachment") {
			apiTokenRoutes[routeGroupName]["read_one"] = &RouteDetail{
				Path:   route.Path,
				Method: route.Method,
			}
		}
	}
}

// GetAvailableAPIRoutesForToken returns a list of all API routes which are available for token usage.
// @Summary Get a list of all token api routes
// @Description Returns a list of all API routes which are available to use with an api token, not a user login.
// @tags api
// @Produce json
// @Security JWTKeyAuth
// @Success 200 {array} models.APITokenRoute "The list of all routes."
// @Router /routes [get]
func GetAvailableAPIRoutesForToken(c echo.Context) error {
	return c.JSON(http.StatusOK, apiTokenRoutes)
}

// CanDoAPIRoute checks if a token is allowed to use the current api route
func CanDoAPIRoute(c echo.Context, token *APIToken) (can bool) {
	path := c.Path()
	if path == "" {
		// c.Path() is empty during testing, but returns the path which
		// the route used during registration which is what we need.
		path = c.Request().URL.Path
	}

	routeGroupName, routeParts := getRouteGroupName(path)

	group, hasGroup := token.Permissions[routeGroupName]
	if !hasGroup {
		group, hasGroup = token.Permissions[routeParts[0]]
		if !hasGroup {
			return false
		}
	}

	var route string
	routes, has := apiTokenRoutes[routeGroupName]
	if !has {
		routes, has = apiTokenRoutes[routeParts[0]]
		if !has {
			return false
		}
		route = strings.Join(routeParts[1:], "_")
	}

	if routes["create"] != nil && routes["create"].Path == path && routes["create"].Method == c.Request().Method {
		route = "create"
	}
	if routes["read_one"] != nil && routes["read_one"].Path == path && routes["read_one"].Method == c.Request().Method {
		route = "read_one"
	}
	if routes["read_all"] != nil && routes["read_all"].Path == path && routes["read_all"].Method == c.Request().Method {
		route = "read_all"
	}
	if routes["update"] != nil && routes["update"].Path == path && routes["update"].Method == c.Request().Method {
		route = "update"
	}
	if routes["delete"] != nil && routes["delete"].Path == path && routes["delete"].Method == c.Request().Method {
		route = "delete"
	}

	// The tasks read_all route is available as /:project/tasks and /tasks/all - therefore we need this workaround here.
	if routeGroupName == "tasks" && path == "/api/v1/projects/:project/tasks" && c.Request().Method == http.MethodGet {
		route = "read_all"
	}

	for _, p := range group {
		if p == route {
			return true
		}
	}

	log.Debugf("[auth] Token %d tried to use route %s which requires permission %s but has only %v", token.ID, path, route, token.Permissions)

	return false
}

func PermissionsAreValid(permissions APIPermissions) (err error) {

	for key, methods := range permissions {
		routes, has := apiTokenRoutes[key]
		if !has {
			return &ErrInvalidAPITokenPermission{
				Group: key,
			}
		}

		for _, method := range methods {
			if routes[method] == nil {
				return &ErrInvalidAPITokenPermission{
					Group:      key,
					Permission: method,
				}
			}
		}
	}

	return nil
}
